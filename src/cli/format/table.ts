/** Dependency-free box-drawing table for terminal output. */
export interface TableColumn<Row> {
  header: string;
  value: (row: Row) => string | number | null | undefined;
  align?: "left" | "right";
}

export function formatTable<Row>(rows: Row[], columns: TableColumn<Row>[]): string {
  const cells = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      return v === null || v === undefined ? "-" : String(v);
    }),
  );
  const widths = columns.map((c, i) =>
    Math.max(c.header.length, ...cells.map((row) => (row[i] ?? "").length)),
  );
  const line = (l: string, m: string, r: string) =>
    l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const render = (row: string[]) =>
    "│ " +
    row
      .map((cell, i) =>
        columns[i]?.align === "right" ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0),
      )
      .join(" │ ") +
    " │";
  return [
    line("┌", "┬", "┐"),
    render(columns.map((c) => c.header)),
    line("├", "┼", "┤"),
    ...cells.map(render),
    line("└", "┴", "┘"),
  ].join("\n");
}
