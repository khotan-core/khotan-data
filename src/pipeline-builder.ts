import type {
  DataRecord,
  Extractor,
  Loader,
  PipelineEventListener,
  PipelineOptions,
  PipelineResult,
  PipelineStepError,
  Transformer,
} from "./types.js";

/**
 * A composable, type-safe ETL pipeline builder.
 *
 * @example
 * ```ts
 * const result = await Pipeline.create("my-pipeline")
 *   .extract(myExtractor)
 *   .transform(myTransformer)
 *   .load(myLoader)
 *   .run();
 * ```
 */
export class Pipeline<TCurrent extends DataRecord = DataRecord> {
  readonly #name: string;
  readonly #extractor: Extractor<DataRecord> | null;
  readonly #transformers: Transformer<DataRecord, DataRecord>[];
  readonly #loaders: Loader<DataRecord>[];
  readonly #listeners: PipelineEventListener[];

  private constructor(
    name: string,
    extractor: Extractor<DataRecord> | null,
    transformers: Transformer<DataRecord, DataRecord>[],
    loaders: Loader<DataRecord>[],
    listeners: PipelineEventListener[],
  ) {
    this.#name = name;
    this.#extractor = extractor;
    this.#transformers = transformers;
    this.#loaders = loaders;
    this.#listeners = listeners;
  }

  static create(name: string): Pipeline<DataRecord> {
    return new Pipeline(name, null, [], [], []);
  }

  get name(): string {
    return this.#name;
  }

  /**
   * Set the data source for this pipeline.
   */
  extract<T extends DataRecord>(
    extractor: Extractor<T>,
  ): Pipeline<T> {
    return new Pipeline(
      this.#name,
      extractor as Extractor<DataRecord>,
      this.#transformers,
      this.#loaders,
      this.#listeners,
    );
  }

  /**
   * Add a transformation step.
   */
  transform<TOutput extends DataRecord>(
    transformer: Transformer<TCurrent, TOutput>,
  ): Pipeline<TOutput> {
    return new Pipeline(
      this.#name,
      this.#extractor,
      [
        ...this.#transformers,
        transformer as Transformer<DataRecord, DataRecord>,
      ],
      this.#loaders,
      this.#listeners,
    );
  }

  /**
   * Add a load destination.
   */
  load(loader: Loader<TCurrent>): Pipeline<TCurrent> {
    return new Pipeline(
      this.#name,
      this.#extractor,
      this.#transformers,
      [...this.#loaders, loader as Loader<DataRecord>],
      this.#listeners,
    );
  }

  /**
   * Subscribe to pipeline events.
   */
  on(listener: PipelineEventListener): Pipeline<TCurrent> {
    return new Pipeline(
      this.#name,
      this.#extractor,
      this.#transformers,
      this.#loaders,
      [...this.#listeners, listener],
    );
  }

  /**
   * Execute the pipeline.
   */
  async run(options: PipelineOptions = {}): Promise<PipelineResult> {
    if (!this.#extractor) {
      throw new Error(
        `Pipeline "${this.#name}" has no extractor. Call .extract() before .run().`,
      );
    }

    if (this.#loaders.length === 0) {
      throw new Error(
        `Pipeline "${this.#name}" has no loaders. Call .load() before .run().`,
      );
    }

    const {
      batchSize = 1000,
      continueOnError = false,
      signal,
    } = options;

    const startTime = performance.now();
    const errors: PipelineStepError[] = [];
    let recordsProcessed = 0;
    let recordsLoaded = 0;

    this.#emit({
      type: "pipeline:start",
      timestamp: new Date(),
      data: { name: this.#name },
    });

    let batch: DataRecord[] = [];

    const flushBatch = async (): Promise<void> => {
      if (batch.length === 0) return;

      for (const loader of this.#loaders) {
        try {
          this.#emit({
            type: "step:start",
            timestamp: new Date(),
            stepName: loader.name,
          });

          const result = await loader.load(batch);
          recordsLoaded += result.recordsLoaded;

          for (const err of result.errors) {
            errors.push({
              stepName: loader.name,
              error: err.error,
              record: err.record,
            });
          }

          this.#emit({
            type: "step:end",
            timestamp: new Date(),
            stepName: loader.name,
            data: result,
          });
        } catch (err) {
          const error =
            err instanceof Error ? err : new Error(String(err));
          errors.push({ stepName: loader.name, error });

          if (!continueOnError) {
            throw error;
          }
        }
      }

      batch = [];
    };

    try {
      for await (const raw of this.#extractor.extract()) {
        if (signal?.aborted) {
          break;
        }

        this.#emit({
          type: "record:extracted",
          timestamp: new Date(),
          stepName: this.#extractor.name,
          data: raw,
        });

        let records: DataRecord[] = [raw];

        for (const transformer of this.#transformers) {
          const nextRecords: DataRecord[] = [];

          for (const record of records) {
            try {
              this.#emit({
                type: "step:start",
                timestamp: new Date(),
                stepName: transformer.name,
              });

              const result = await transformer.transform(record);
              const transformed = Array.isArray(result)
                ? result
                : [result];
              nextRecords.push(...transformed);

              this.#emit({
                type: "record:transformed",
                timestamp: new Date(),
                stepName: transformer.name,
                data: transformed,
              });
            } catch (err) {
              const error =
                err instanceof Error ? err : new Error(String(err));
              errors.push({
                stepName: transformer.name,
                error,
                record,
              });

              this.#emit({
                type: "error",
                timestamp: new Date(),
                stepName: transformer.name,
                data: error,
              });

              if (!continueOnError) {
                throw error;
              }
            }
          }

          records = nextRecords;
        }

        batch.push(...records);
        recordsProcessed += records.length;

        if (batch.length >= batchSize) {
          await flushBatch();
        }
      }

      await flushBatch();
    } catch (err) {
      if (!continueOnError) {
        const duration = performance.now() - startTime;
        this.#emit({
          type: "pipeline:end",
          timestamp: new Date(),
          data: { recordsProcessed, recordsLoaded, errors, duration },
        });
        return { recordsProcessed, recordsLoaded, errors, duration };
      }
    }

    const duration = performance.now() - startTime;

    this.#emit({
      type: "pipeline:end",
      timestamp: new Date(),
      data: { recordsProcessed, recordsLoaded, errors, duration },
    });

    return { recordsProcessed, recordsLoaded, errors, duration };
  }

  #emit(event: {
    type: string;
    timestamp: Date;
    stepName?: string;
    data?: unknown;
  }): void {
    for (const listener of this.#listeners) {
      listener(event as Parameters<PipelineEventListener>[0]);
    }
  }
}
