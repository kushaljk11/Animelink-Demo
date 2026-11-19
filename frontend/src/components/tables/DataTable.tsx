"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, FileJson, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, Download, FileText, Filter, Inbox, RefreshCw, Search, Settings2, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Checkbox, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Sheet } from "@/components/ui/overlays";
import { Card, EmptyState, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api, apiUrl, errorMessage, qs, type Paginated } from "@/lib/api";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    /** Value written to client-side CSV export. Defaults to the accessor value. */
    exportValue?: (row: TData) => unknown;
    className?: string;
  }
}

export type Facet = { key: string; label: string; options: { value: string; label: string }[]; single?: boolean };
export type BulkAction<T> = { id: string; label: string; icon?: LucideIcon; variant?: "secondary" | "danger" | "success" | "primary"; run: (rows: T[]) => Promise<string | void> };
export type InspectorProps<T> = { row: T; close: () => void; refresh: () => void };

export type DataTableProps<T> = {
  endpoint: string;
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  facets?: Facet[];
  defaultSort?: { id: string; desc: boolean };
  /** Fixed query params (e.g. { mine: "true" }). */
  extraParams?: Record<string, string>;
  bulkActions?: BulkAction<T>[];
  /** Enables "export all matching" via /api/reports/export?entity=… */
  exportEntity?: string;
  inspector?: ComponentType<InspectorProps<T>>;
  inspectorTitle?: (row: T) => ReactNode;
  inspectorDescription?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  csvName?: string;
  pageSize?: number;
  /** Bump to force a refetch from the parent (e.g. after a create dialog). */
  refreshKey?: number;
  /** Column ids hidden until the user turns them on. */
  defaultHidden?: string[];
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FacetFilter({ facet, value, onChange }: { facet: Facet; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className={cn("border-dashed", value.length && "border-solid")}>
          <Filter className="text-muted" />
          {facet.label}
          {value.length > 0 && (
            <span className="ml-0.5 rounded bg-surface-3 px-1.5 text-[10px] font-semibold text-fg">{value.length === 1 ? facet.options.find((o) => o.value === value[0])?.label : value.length}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
        {facet.options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => {
              if (facet.single) onChange(c ? [o.value] : []);
              else onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value));
            }}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="justify-center text-xs">
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTable<T>({
  endpoint,
  columns,
  getRowId,
  searchPlaceholder = "Search…",
  facets = [],
  defaultSort,
  extraParams,
  bulkActions,
  exportEntity,
  inspector: Inspector,
  inspectorTitle,
  inspectorDescription,
  onRowClick,
  toolbar,
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting the search or filters.",
  csvName,
  pageSize: initialPageSize = 20,
  refreshKey = 0,
  defaultHidden,
}: DataTableProps<T>) {
  const storageKey = `rtn.table.cols:${endpoint}`;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sorting, setSorting] = useState<SortingState>(defaultSort ? [defaultSort] : []);
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => Object.fromEntries((defaultHidden ?? []).map((k) => [k, false])));
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [inspected, setInspected] = useState<T | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const rowCache = useRef(new Map<string, T>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setColumnVisibility(JSON.parse(saved) as VisibilityState);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    setPage(1);
  }, [query, facetValues, pageSize]);

  const params = {
    page,
    limit: pageSize,
    query: query || undefined,
    sort: sorting[0]?.id,
    order: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
    ...Object.fromEntries(Object.entries(facetValues).filter(([, v]) => v.length).map(([k, v]) => [k, v.join(",")])),
    ...extraParams,
  };
  const key = `${endpoint}${qs(params)}`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<Paginated<T>>(key, { keepPreviousData: true });

  useEffect(() => {
    if (refreshKey) void mutate();
  }, [refreshKey, mutate]);

  const rows = useMemo(() => data?.data ?? [], [data]);

  // If a refresh/bulk action shrinks the result set below the current page, snap back to the last page.
  useEffect(() => {
    if (data && data.meta.total > 0 && page > data.meta.pageCount) setPage(data.meta.pageCount);
  }, [data, page]);
  useEffect(() => {
    for (const r of rows) rowCache.current.set(getRowId(r), r);
  }, [rows, getRowId]);

  // URL facets: /app/x?status=PENDING_VERIFICATION pre-applies matching filters (and ?query= prefills search) (after mount, so SSR markup stays stable).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl: Record<string, string[]> = {};
    for (const f of facets) {
      const v = sp.get(f.key);
      if (v) fromUrl[f.key] = v.split(",").filter((x) => f.options.some((o) => o.value === x));
    }
    if (Object.keys(fromUrl).length) setFacetValues((s) => ({ ...s, ...fromUrl }));
    const q = sp.get("query");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /app/x?open=<id> opens the inspector for that record.
  useEffect(() => {
    if (!Inspector) return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id) return;
    api<T>(`${endpoint}/${encodeURIComponent(id)}`)
      .then((r) => setInspected(r))
      .catch((err) => toast.error(errorMessage(err)));
  }, [endpoint, Inspector]);

  const selectable = !!bulkActions?.length;
  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: "__select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select page"
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />,
        meta: { className: "w-10" },
      },
      ...columns,
    ];
  }, [columns, selectable]);

  const table = useReactTable({
    data: rows,
    columns: allColumns,
    getRowId,
    state: { sorting, columnVisibility, rowSelection },
    defaultColumn: { enableSorting: false },
    manualPagination: true,
    manualSorting: true,
    pageCount: data?.meta.pageCount ?? -1,
    enableRowSelection: selectable,
    onSortingChange: (u) => {
      setSorting(u);
      setPage(1);
    },
    onColumnVisibilityChange: (u) => {
      setColumnVisibility((prev) => {
        const next = typeof u === "function" ? u(prev) : u;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedRows = selectedIds.map((id) => rowCache.current.get(id)).filter((r): r is T => !!r);
  const activeFilters = Object.values(facetValues).some((v) => v.length) || !!query;
  const meta = data?.meta;
  const from = meta && meta.total ? (meta.page - 1) * meta.limit + 1 : 0;
  const to = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  const exportColumns = table.getVisibleLeafColumns().filter((c) => c.id !== "__select" && c.id !== "__actions");
  const exportSelected = () => {
    const header = exportColumns.map((c) => csvCell(c.columnDef.meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)));
    const lines = selectedRows.map((r) =>
      exportColumns
        .map((c) => {
          const m = c.columnDef.meta;
          if (m?.exportValue) return csvCell(m.exportValue(r));
          const acc = (c.columnDef as { accessorKey?: string }).accessorKey;
          return csvCell(acc ? (r as Record<string, unknown>)[acc] : "");
        })
        .join(","),
    );
    downloadBlob("﻿" + [header.join(","), ...lines].join("\r\n"), `${csvName ?? "export"}-selected-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    toast.success(`Exported ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"}`);
  };

  /** Full records (all fields, not just visible columns) for the selected rows. */
  const exportSelectedJson = () => {
    downloadBlob(JSON.stringify(selectedRows, null, 2), `${csvName ?? "export"}-selected-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast.success(`Exported ${selectedRows.length} record${selectedRows.length === 1 ? "" : "s"} as JSON`);
  };

  const serverExport = (format: "csv" | "pdf") => {
    if (!exportEntity) return;
    const status = facetValues.status?.join(",");
    window.location.href = apiUrl(`/reports/export${qs({ entity: exportEntity, format, status, municipality: extraParams?.municipality })}`);
  };

  const runBulk = async (action: BulkAction<T>) => {
    setBulkBusy(action.id);
    try {
      const msg = await action.run(selectedRows);
      toast.success(msg || `${action.label}: done`);
      setRowSelection({});
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkBusy(null);
    }
  };

  const clickable = !!Inspector || !!onRowClick;
  const openRow = (r: T) => {
    if (onRowClick) onRowClick(r);
    else if (Inspector) setInspected(r);
  };
  const closeInspector = () => {
    setInspected(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("open")) {
      url.searchParams.delete("open");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  };

  return (
    <Card className="relative flex flex-col overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8 pr-8 text-sm" aria-label="Search table" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {facets.map((f) => (
            <FacetFilter key={f.key} facet={f} value={facetValues[f.key] ?? []} onChange={(v) => setFacetValues((s) => ({ ...s, [f.key]: v }))} />
          ))}
          {activeFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setFacetValues({}); setSearch(""); }}>
              Reset <X />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          <Button variant="ghost" size="icon-sm" onClick={() => void mutate()} aria-label="Refresh">
            <RefreshCw className={cn(isValidating && "animate-spin")} />
          </Button>
          {exportEntity && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <DropdownMenuLabel>All matching records</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => serverExport("csv")}>
                  <Download /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => serverExport("pdf")}>
                  <FileText /> PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" aria-label="Toggle columns">
                <Settings2 /> <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                    {c.columnDef.meta?.label ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isValidating && !isLoading && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent/60" />}

      {/* grid */}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2/80 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id} className={cn("h-10 whitespace-nowrap px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted first:pl-4", h.column.columnDef.meta?.className)}>
                      {h.isPlaceholder ? null : sortable ? (
                        <button onClick={h.column.getToggleSortingHandler()} className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-3 hover:text-fg">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {table.getVisibleLeafColumns().map((c) => (
                    <td key={c.id} className="px-3 py-3 first:pl-4">
                      <Skeleton className="h-4 w-full max-w-36" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={clickable ? () => openRow(row.original) : undefined}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn("border-b border-border transition-colors last:border-0 data-[state=selected]:bg-accent/5", clickable && "cursor-pointer hover:bg-surface-2/70")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3 py-2.5 align-middle first:pl-4", cell.column.columnDef.meta?.className)} onClick={cell.column.id === "__select" || cell.column.id === "__actions" ? (e) => e.stopPropagation() : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!isLoading && error && <EmptyState icon={<X />} title="Could not load records" description={errorMessage(error)} action={<Button size="sm" onClick={() => void mutate()}>Retry</Button>} />}
        {!isLoading && !error && rows.length === 0 && <EmptyState icon={<Inbox />} title={emptyTitle} description={activeFilters ? "Try adjusting the search or filters." : emptyDescription} />}
      </div>

      {/* pagination */}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted sm:flex-row">
        <div className="flex items-center gap-3">
          <span>{meta ? (meta.total ? `Showing ${from}–${to} of ${meta.total}` : "No results") : "Loading…"}</span>
          {selectedIds.length > 0 && <span className="font-medium text-fg">{selectedIds.length} selected</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 w-[72px] text-xs" aria-label="Rows per page">
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <span className="px-1 tabular-nums">
            Page {meta?.page ?? page} of {meta?.pageCount ?? 1}
          </span>
          <Button variant="secondary" size="icon-sm" onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page"><ChevronsLeft /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page"><ChevronLeft /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={!meta || page >= meta.pageCount} aria-label="Next page"><ChevronRight /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => meta && setPage(meta.pageCount)} disabled={!meta || page >= meta.pageCount} aria-label="Last page"><ChevronsRight /></Button>
        </div>
      </div>

      {/* bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="pointer-events-none sticky bottom-3 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full animate-zoom-in flex-wrap items-center gap-2 rounded-xl border border-border-strong bg-surface p-2 pl-4 shadow-pop">
            <span className="text-sm font-medium text-fg">{selectedIds.length} selected</span>
            <span className="mx-1 h-5 w-px bg-border" />
            {bulkActions?.map((a) => {
              const Icon = a.icon;
              return (
                <Button key={a.id} size="sm" variant={a.variant ?? "secondary"} loading={bulkBusy === a.id} disabled={bulkBusy !== null} onClick={() => void runBulk(a)}>
                  {Icon && <Icon />} {a.label}
                </Button>
              );
            })}
            <Button size="sm" variant="secondary" onClick={exportSelected} disabled={!selectedRows.length}>
              <Download /> CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={exportSelectedJson} disabled={!selectedRows.length}>
              <FileJson /> JSON
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setRowSelection({})} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}

      {Inspector && inspected && (
        <Sheet open onOpenChange={(o) => !o && closeInspector()} title={inspectorTitle?.(inspected) ?? "Details"} description={inspectorDescription?.(inspected)}>
          <Inspector
            row={inspected}
            close={closeInspector}
            refresh={() => {
              void mutate();
            }}
          />
        </Sheet>
      )}
    </Card>
  );
}

/** Runs one request per row and summarises the outcome for bulk actions. */
export async function runEach<T>(rows: T[], fn: (row: T) => Promise<unknown>, verb: string) {
  const results = await Promise.allSettled(rows.map(fn));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - ok;
  if (ok === 0) throw new Error(`${verb} failed for all ${failed} selected record${failed === 1 ? "" : "s"}`);
  return `${verb} ${ok} record${ok === 1 ? "" : "s"}${failed ? ` · ${failed} skipped (not allowed in current state)` : ""}`;
}
