/** A single record flowing through a pipeline. */
export type DataRecord = Record<string, unknown>;

/** Extracts data from a source, yielding records lazily. */
export interface Extractor<T extends DataRecord = DataRecord> {
  readonly name: string;
  extract(): AsyncIterable<T>;
}

/** Transforms a record into zero or more output records. */
export interface Transformer<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
> {
  readonly name: string;
  transform(record: TInput): TOutput | TOutput[] | Promise<TOutput | TOutput[]>;
}

/** Loads a batch of records into a destination. */
export interface Loader<T extends DataRecord = DataRecord> {
  readonly name: string;
  load(records: T[]): Promise<LoadResult>;
}

export interface LoadResult {
  readonly recordsLoaded: number;
  readonly errors: LoadError[];
}

export interface LoadError {
  readonly record: DataRecord;
  readonly error: Error;
}

/** Events emitted during pipeline execution. */
export interface PipelineEvent {
  readonly type:
    | "pipeline:start"
    | "pipeline:end"
    | "pipeline:cancelled"
    | "step:start"
    | "step:end"
    | "record:extracted"
    | "record:transformed"
    | "record:loaded"
    | "error";
  readonly timestamp: Date;
  readonly stepName?: string;
  readonly data?: unknown;
}

export type PipelineEventListener = (event: PipelineEvent) => void;

export interface PipelineOptions {
  /** Records per load batch. Defaults to 1000. */
  readonly batchSize?: number;
  /** Keep processing after errors instead of throwing. */
  readonly continueOnError?: boolean;
  /** Cancel the pipeline. */
  readonly signal?: AbortSignal;
}

export interface PipelineResult {
  readonly recordsProcessed: number;
  readonly recordsLoaded: number;
  readonly errors: PipelineStepError[];
  readonly duration: number;
  readonly cancelled: boolean;
}

export interface PipelineStepError {
  readonly stepName: string;
  readonly error: Error;
  readonly record?: DataRecord;
}
