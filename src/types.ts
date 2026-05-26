/**
 * Core type definitions for khotan-data primitives.
 */

/** A single unit of data flowing through a pipeline. */
export type DataRecord = Record<string, unknown>;

/** A function that extracts data from a source, yielding records. */
export interface Extractor<T extends DataRecord = DataRecord> {
  readonly name: string;
  extract(): AsyncIterable<T>;
}

/** A function that transforms a single record into zero or more records. */
export interface Transformer<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
> {
  readonly name: string;
  transform(record: TInput): TOutput | TOutput[] | Promise<TOutput | TOutput[]>;
}

/** A function that loads records into a destination. */
export interface Loader<T extends DataRecord = DataRecord> {
  readonly name: string;
  load(records: T[]): Promise<LoadResult>;
}

/** Result of a load operation. */
export interface LoadResult {
  readonly recordsLoaded: number;
  readonly errors: LoadError[];
}

/** An error that occurred during loading. */
export interface LoadError {
  readonly record: DataRecord;
  readonly error: Error;
}

/** Configuration for a pipeline step. */
export interface PipelineStep<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
> {
  readonly name: string;
  readonly type: "extract" | "transform" | "load";
  readonly fn: Extractor<TOutput> | Transformer<TInput, TOutput> | Loader<TInput>;
}

/** Events emitted during pipeline execution. */
export interface PipelineEvent {
  readonly type:
    | "pipeline:start"
    | "pipeline:end"
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

/** A listener for pipeline events. */
export type PipelineEventListener = (event: PipelineEvent) => void;

/** Options for pipeline execution. */
export interface PipelineOptions {
  /** Maximum number of records to process in a single batch. */
  readonly batchSize?: number;
  /** Whether to continue processing on error. */
  readonly continueOnError?: boolean;
  /** An AbortSignal to cancel the pipeline. */
  readonly signal?: AbortSignal;
}

/** Result of a pipeline execution. */
export interface PipelineResult {
  readonly recordsProcessed: number;
  readonly recordsLoaded: number;
  readonly errors: PipelineStepError[];
  readonly duration: number;
}

/** An error tied to a specific pipeline step. */
export interface PipelineStepError {
  readonly stepName: string;
  readonly error: Error;
  readonly record?: DataRecord;
}
