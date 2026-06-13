"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResourceDefinition {
  uniqueIdentifier: string;
}

interface ResourceRecord {
  id: string;
  name: string;
  description?: string | null;
  mapping: {
    connectField: string | string[];
    plugs?: Record<string, ResourceDefinition>;
  };
}

interface MappingRecord {
  id: string;
  resourceId: string;
  connectValue: string;
  refs: Record<string, string>;
  metadata?: Record<string, unknown> | null;
}

interface MappingPage {
  items: MappingRecord[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
    prevOffset: number;
    nextOffset: number;
    total: number;
  };
}

interface RefEntry {
  plugName: string;
  ref: string;
}

type FormMode = "create" | "edit";

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function toPrettyJson(value: Record<string, unknown> | null | undefined): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

function parseMetadata(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Metadata must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function toRefEntries(refs: Record<string, string>): RefEntry[] {
  return Object.entries(refs).map(([plugName, ref]) => ({ plugName, ref }));
}

function parseConnectValueInput(
  resource: ResourceRecord | null,
  rawValue: string,
): string | string[] {
  if (!resource || !Array.isArray(resource.mapping.connectField)) {
    return rawValue;
  }

  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("[")) {
    return rawValue;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error(
      "Composite connect values must be provided as a JSON string array in declared field order.",
    );
  }
  return parsed;
}

function formatConnectField(connectField: string | string[]): string {
  return Array.isArray(connectField)
    ? connectField.join(" -> ")
    : String(connectField);
}

export function KhotanMappingBrowser({
  pageSize = 20,
}: {
  pageSize?: number;
} = {}) {
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [mappings, setMappings] = useState<MappingRecord[]>([]);
  const [page, setPage] = useState<MappingPage["page"] | null>(null);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [connectValueInput, setConnectValueInput] = useState("");
  const [metadataInput, setMetadataInput] = useState("");
  const [dynamicRefs, setDynamicRefs] = useState<RefEntry[]>([
    { plugName: "", ref: "" },
  ]);
  const [declaredRefs, setDeclaredRefs] = useState<Record<string, string>>({});

  const selectedResource =
    resources.find((resource) => resource.id === selectedResourceId) ?? null;
  const declaredPlugNames = useMemo(
    () => Object.keys(selectedResource?.mapping.plugs ?? {}),
    [selectedResource],
  );

  async function fetchResources() {
    setResourcesLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/khotan/resources");
      if (!res.ok) {
        throw new Error("Failed to fetch resources from /api/khotan/resources");
      }
      const data = (await res.json()) as ResourceRecord[];
      setResources(data);

      setSelectedResourceId((current) => {
        if (data.length === 0) return "";
        if (data.some((resource) => resource.id === current)) return current;
        if (data.length === 1) return data[0]!.id;
        return current || data[0]!.id;
      });
    } catch (error) {
      setError(readErrorMessage(error));
    } finally {
      setResourcesLoading(false);
    }
  }

  async function fetchMappings(resourceId: string, nextOffset: number, term: string) {
    setMappingsLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/khotan/resources/${resourceId}/mappings`,
        window.location.origin,
      );
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(nextOffset));
      if (term.trim()) {
        url.searchParams.set("search", term.trim());
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error("Failed to fetch mappings for the selected resource");
      }
      const data = (await res.json()) as MappingPage;
      setMappings(data.items);
      setPage(data.page);
    } catch (error) {
      setError(readErrorMessage(error));
      setMappings([]);
      setPage(null);
    } finally {
      setMappingsLoading(false);
    }
  }

  useEffect(() => {
    void fetchResources();
  }, []);

  useEffect(() => {
    if (!selectedResourceId) {
      setMappings([]);
      setPage(null);
      return;
    }
    void fetchMappings(selectedResourceId, offset, search);
  }, [selectedResourceId, offset, pageSize, search]);

  useEffect(() => {
    setOffset(0);
  }, [selectedResourceId]);

  function resetForm() {
    setFormMode(null);
    setEditingMappingId(null);
    setConnectValueInput("");
    setMetadataInput("");
    setDynamicRefs([{ plugName: "", ref: "" }]);
    setDeclaredRefs({});
    setActionError(null);
  }

  function openCreateForm() {
    resetForm();
    setFormMode("create");
    if (declaredPlugNames.length > 0) {
      setDeclaredRefs(
        Object.fromEntries(declaredPlugNames.map((plugName) => [plugName, ""])),
      );
      setDynamicRefs([]);
    }
  }

  function openEditForm(mapping: MappingRecord) {
    setFormMode("edit");
    setEditingMappingId(mapping.id);
    setConnectValueInput(mapping.connectValue);
    setMetadataInput(toPrettyJson(mapping.metadata));
    setActionError(null);

    if (declaredPlugNames.length > 0) {
      const nextDeclaredRefs = Object.fromEntries(
        declaredPlugNames.map((plugName) => [plugName, mapping.refs[plugName] ?? ""]),
      );
      setDeclaredRefs(nextDeclaredRefs);
      setDynamicRefs([]);
      return;
    }

    setDeclaredRefs({});
    setDynamicRefs(
      toRefEntries(mapping.refs).length > 0
        ? toRefEntries(mapping.refs)
        : [{ plugName: "", ref: "" }],
    );
  }

  function buildRefsPayload(): Record<string, string> {
    if (declaredPlugNames.length > 0) {
      return Object.fromEntries(
        Object.entries(declaredRefs)
          .map(([plugName, ref]) => [plugName, ref.trim()] as const)
          .filter(([, ref]) => ref.length > 0),
      );
    }

    return Object.fromEntries(
      dynamicRefs
        .map((entry) => ({
          plugName: entry.plugName.trim(),
          ref: entry.ref.trim(),
        }))
        .filter((entry) => entry.plugName && entry.ref)
        .map((entry) => [entry.plugName, entry.ref] as const),
    );
  }

  async function submitForm() {
    if (!selectedResource) {
      setActionError("Select a resource before saving a mapping.");
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const metadata = parseMetadata(metadataInput);
      const refs = buildRefsPayload();
      const connectValue = parseConnectValueInput(
        selectedResource,
        connectValueInput,
      );

      if (
        (typeof connectValue === "string" && !connectValue.trim()) ||
        (Array.isArray(connectValue) && connectValue.length === 0)
      ) {
        throw new Error("Connect value is required.");
      }

      if (Object.keys(refs).length === 0) {
        throw new Error("At least one ref is required.");
      }

      const body = {
        resourceId: selectedResource.id,
        connectValue,
        refs,
        metadata,
      };

      const url =
        formMode === "edit" && editingMappingId
          ? `/api/khotan/mappings/${editingMappingId}`
          : "/api/khotan/mappings";
      const method = formMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to save mapping.");
      }

      resetForm();
      await fetchMappings(selectedResource.id, offset, search);
    } catch (error) {
      setActionError(readErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(mapping: MappingRecord) {
    const confirmed = window.confirm(
      `Delete mapping "${mapping.connectValue}"? This removes the shared identity row for the selected resource.`,
    );
    if (!confirmed) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/khotan/mappings/${mapping.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to delete mapping.");
      }

      const nextOffset =
        mappings.length === 1 && offset > 0 ? Math.max(offset - pageSize, 0) : offset;
      setOffset(nextOffset);
      await fetchMappings(mapping.resourceId, nextOffset, search);
    } catch (error) {
      setActionError(readErrorMessage(error));
    }
  }

  function renderRefsSummary(mapping: MappingRecord) {
    const entries = Object.entries(mapping.refs);
    if (entries.length === 0) {
      return <span className="text-muted-foreground text-sm">No refs</span>;
    }
    return (
      <div className="space-y-1">
        {entries.map(([plugName, ref]) => (
          <div key={plugName} className="text-sm">
            <span className="font-medium">{plugName}:</span> {ref}
          </div>
        ))}
      </div>
    );
  }

  function renderMetadataSummary(mapping: MappingRecord) {
    const entries = Object.entries(mapping.metadata ?? {});
    if (entries.length === 0) {
      return <span className="text-muted-foreground text-sm">No metadata</span>;
    }
    return (
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="text-sm">
            <span className="font-medium">{key}:</span> {String(value)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <CardTitle>Mappings Browser</CardTitle>
            <p className="text-muted-foreground text-sm">
              Browse shared identities by resource, search by connect value, and
              maintain per-plug refs without mixing them into metadata.
            </p>
          </div>
          <Button onClick={openCreateForm} disabled={!selectedResourceId}>
            Create Mapping
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
            <div className="space-y-2">
              <Label htmlFor="resource-select">Resource</Label>
              <select
                id="resource-select"
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={selectedResourceId}
                onChange={(event) => {
                  setSelectedResourceId(event.target.value);
                  setSearch("");
                  setOffset(0);
                  resetForm();
                }}
                disabled={resourcesLoading || resources.length === 0}
              >
                {resources.length === 0 ? (
                  <option value="">No resources</option>
                ) : (
                  resources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))
                )}
              </select>
              {selectedResource ? (
                <p className="text-muted-foreground text-xs">
                  mapping.connectField:{" "}
                  {formatConnectField(selectedResource.mapping.connectField)}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mapping-search">Search</Label>
              <Input
                id="mapping-search"
                placeholder="Search connect values, refs, or metadata"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
                disabled={!selectedResourceId}
              />
            </div>
          </div>

          {resourcesLoading ? (
            <div className="text-muted-foreground text-sm">Loading resources...</div>
          ) : null}

          {!resourcesLoading && resources.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No resources are registered yet. Mappings require registered resources
              in your `khotan()` config.
            </div>
          ) : null}

          {error ? (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedResourceId) {
                    void fetchMappings(selectedResourceId, offset, search);
                  } else {
                    void fetchResources();
                  }
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {formMode ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {formMode === "create" ? "Create Mapping" : "Edit Mapping"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="connect-value">Connect Value</Label>
              <Input
                id="connect-value"
                value={connectValueInput}
                onChange={(event) => setConnectValueInput(event.target.value)}
                placeholder={
                  Array.isArray(selectedResource?.mapping.connectField)
                    ? 'Use the canonical string or JSON array, e.g. ["tenant-a","alice@example.com"]'
                    : "alice@example.com"
                }
              />
              {Array.isArray(selectedResource?.mapping.connectField) ? (
                <p className="text-muted-foreground text-xs">
                  Composite resources can accept a JSON array in declared field
                  order: {selectedResource.mapping.connectField.join(" -> ")}.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <Label>Refs</Label>
                <p className="text-muted-foreground text-xs">
                  Refs are the external per-plug identifiers for this shared
                  entity.
                </p>
              </div>

              {declaredPlugNames.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {declaredPlugNames.map((plugName) => (
                    <div key={plugName} className="space-y-2">
                      <Label htmlFor={`ref-${plugName}`}>{plugName}</Label>
                      <Input
                        id={`ref-${plugName}`}
                        value={declaredRefs[plugName] ?? ""}
                        placeholder={
                          selectedResource?.mapping.plugs?.[plugName]?.uniqueIdentifier ??
                          "External ID"
                        }
                        onChange={(event) =>
                          setDeclaredRefs((current) => ({
                            ...current,
                            [plugName]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {dynamicRefs.map((entry, index) => (
                    <div
                      key={`${entry.plugName}-${index}`}
                      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <Input
                        placeholder="Plug name"
                        value={entry.plugName}
                        onChange={(event) =>
                          setDynamicRefs((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, plugName: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="External ref"
                        value={entry.ref}
                        onChange={(event) =>
                          setDynamicRefs((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, ref: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setDynamicRefs((current) =>
                            current.length === 1
                              ? [{ plugName: "", ref: "" }]
                              : current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDynamicRefs((current) => [
                        ...current,
                        { plugName: "", ref: "" },
                      ])
                    }
                  >
                    Add Ref
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="metadata-json">Metadata</Label>
              <p className="text-muted-foreground text-xs">
                Metadata is for contextual display fields only, separate from
                mapping identity refs.
              </p>
              <textarea
                id="metadata-json"
                className="border-input bg-background min-h-32 w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={metadataInput}
                onChange={(event) => setMetadataInput(event.target.value)}
                placeholder='{"firstName":"Alice","company":"Example Co"}'
              />
            </div>

            {actionError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {actionError}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void submitForm()} disabled={submitting}>
                {submitting
                  ? "Saving..."
                  : formMode === "create"
                    ? "Create Mapping"
                    : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mappings</CardTitle>
          {page ? (
            <p className="text-muted-foreground text-sm">
              {page.total} total mapping{page.total === 1 ? "" : "s"}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {mappingsLoading ? (
            <div className="text-muted-foreground text-sm">Loading mappings...</div>
          ) : null}

          {!mappingsLoading &&
          selectedResource &&
          mappings.length === 0 &&
          search.trim() ? (
            <div className="text-muted-foreground text-sm">
              No mappings match this search for the selected resource.
            </div>
          ) : null}

          {!mappingsLoading &&
          selectedResource &&
          mappings.length === 0 &&
          !search.trim() ? (
            <div className="text-muted-foreground text-sm">
              This resource has no mappings yet. Create the first one to start
              connecting identities across plugs.
            </div>
          ) : null}

          {!mappingsLoading && mappings.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connect Value</TableHead>
                    <TableHead>Refs</TableHead>
                    <TableHead>Metadata</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell className="font-medium">
                        {mapping.connectValue}
                      </TableCell>
                      <TableCell>{renderRefsSummary(mapping)}</TableCell>
                      <TableCell>{renderMetadataSummary(mapping)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(mapping)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDelete(mapping)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {page ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    Showing {page.offset + 1}-
                    {page.offset + mappings.length} of {page.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(page.prevOffset)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!page.hasMore}
                      onClick={() => setOffset(page.nextOffset)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
