import { describe, expect, it, vi } from "vitest";
import { Pipeline } from "./pipeline-builder.js";
import { fromArray } from "./extractors.js";
import { map, filter } from "./transformers.js";
import { toArray } from "./loaders.js";
import type { PipelineEvent } from "./types.js";

describe("Pipeline", () => {
  it("has a name", () => {
    const p = Pipeline.create("test-pipeline");
    expect(p.name).toBe("test-pipeline");
  });

  it("throws if run without an extractor", async () => {
    const output: Record<string, unknown>[] = [];
    const p = Pipeline.create("no-extract").load(toArray("out", output));

    await expect(p.run()).rejects.toThrow("has no extractor");
  });

  it("throws if run without a loader", async () => {
    const p = Pipeline.create("no-load").extract(
      fromArray("in", [{ id: 1 }]),
    );

    await expect(p.run()).rejects.toThrow("has no loaders");
  });

  it("runs a simple extract → load pipeline", async () => {
    const output: { id: number }[] = [];

    const result = await Pipeline.create("simple")
      .extract(fromArray("source", [{ id: 1 }, { id: 2 }, { id: 3 }]))
      .load(toArray("sink", output))
      .run();

    expect(output).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.recordsProcessed).toBe(3);
    expect(result.recordsLoaded).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("runs extract → transform → load", async () => {
    const output: { id: number; doubled: number }[] = [];

    const result = await Pipeline.create("etl")
      .extract(fromArray("source", [{ id: 1 }, { id: 2 }]))
      .transform(
        map("double", (r: { id: number }) => ({
          id: r.id,
          doubled: r.id * 2,
        })),
      )
      .load(toArray("sink", output))
      .run();

    expect(output).toEqual([
      { id: 1, doubled: 2 },
      { id: 2, doubled: 4 },
    ]);
    expect(result.recordsProcessed).toBe(2);
  });

  it("supports chained transforms", async () => {
    const output: Record<string, unknown>[] = [];

    await Pipeline.create("chained")
      .extract(fromArray("source", [{ value: 1 }, { value: 2 }, { value: 3 }]))
      .transform(
        filter("even", (r: { value: number }) => r.value % 2 === 0),
      )
      .transform(
        map("multiply", (r: { value: number }) => ({
          value: r.value * 10,
        })),
      )
      .load(toArray("sink", output))
      .run();

    expect(output).toEqual([{ value: 20 }]);
  });

  it("supports multiple loaders", async () => {
    const output1: { id: number }[] = [];
    const output2: { id: number }[] = [];

    await Pipeline.create("multi-load")
      .extract(fromArray("source", [{ id: 1 }]))
      .load(toArray("sink1", output1))
      .load(toArray("sink2", output2))
      .run();

    expect(output1).toEqual([{ id: 1 }]);
    expect(output2).toEqual([{ id: 1 }]);
  });

  it("emits pipeline events", async () => {
    const events: PipelineEvent[] = [];
    const output: Record<string, unknown>[] = [];

    await Pipeline.create("events")
      .extract(fromArray("source", [{ id: 1 }]))
      .load(toArray("sink", output))
      .on((event) => events.push(event))
      .run();

    const types = events.map((e) => e.type);
    expect(types).toContain("pipeline:start");
    expect(types).toContain("record:extracted");
    expect(types).toContain("pipeline:end");
  });

  it("respects batchSize option", async () => {
    const loadCalls: number[] = [];
    const loader = {
      name: "batch-tracker",
      load: async (records: Record<string, unknown>[]) => {
        loadCalls.push(records.length);
        return { recordsLoaded: records.length, errors: [] };
      },
    };

    await Pipeline.create("batched")
      .extract(
        fromArray(
          "source",
          Array.from({ length: 5 }, (_, i) => ({ id: i })),
        ),
      )
      .load(loader)
      .run({ batchSize: 2 });

    expect(loadCalls).toEqual([2, 2, 1]);
  });

  it("stops on AbortSignal", async () => {
    const controller = new AbortController();
    const output: Record<string, unknown>[] = [];

    const extractor = {
      name: "slow-source",
      async *extract() {
        yield { id: 1 };
        controller.abort();
        yield { id: 2 };
        yield { id: 3 };
      },
    };

    const result = await Pipeline.create("abortable")
      .extract(extractor)
      .load(toArray("sink", output))
      .run({ signal: controller.signal });

    expect(result.recordsProcessed).toBeLessThanOrEqual(2);
  });

  it("continues on error when configured", async () => {
    const output: Record<string, unknown>[] = [];

    const failOnTwo = {
      name: "fail-on-two",
      transform: (r: { id: number }) => {
        if (r.id === 2) throw new Error("fail");
        return r;
      },
    };

    const result = await Pipeline.create("continue-on-error")
      .extract(fromArray("source", [{ id: 1 }, { id: 2 }, { id: 3 }]))
      .transform(failOnTwo)
      .load(toArray("sink", output))
      .run({ continueOnError: true });

    expect(output).toEqual([{ id: 1 }, { id: 3 }]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.stepName).toBe("fail-on-two");
  });

  it("is immutable — each method returns a new pipeline", () => {
    const p1 = Pipeline.create("immutable");
    const p2 = p1.extract(fromArray("source", [{ id: 1 }]));
    const p3 = p2.transform(map("noop", (r) => r));

    expect(p1).not.toBe(p2);
    expect(p2).not.toBe(p3);
  });
});
