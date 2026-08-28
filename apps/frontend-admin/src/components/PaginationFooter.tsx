import { TablePagination } from '@kaipos/ui';

export interface PaginationFooterProps {
  /** Total rows across all pages — drives the next/last buttons. */
  count: number;
  /** Zero-indexed current page (MUI convention). */
  page: number;
  /** Rows per page. */
  limit: number;
  onPageChange: (next: number) => void;
  onLimitChange: (next: number) => void;
}

const ROWS_PER_PAGE = [25, 50, 100];

// Thin wrapper around MUI's TablePagination with the project's Spanish
// labels and rows-per-page options. Exists so each list page doesn't repeat
// 12 lines of identical configuration.
export function PaginationFooter({
  count,
  page,
  limit,
  onPageChange,
  onLimitChange,
}: PaginationFooterProps) {
  return (
    <TablePagination
      component="div"
      // The rows-per-page selector, the range text and the arrows share one row
      // and overflow below ~400px. The selector is the least important of the
      // three, so it drops out first; the range and arrows always stay.
      sx={{
        '& .MuiTablePagination-selectLabel, & .MuiTablePagination-input': {
          display: { xs: 'none', sm: 'flex' },
        },
      }}
      count={count}
      page={page}
      onPageChange={(_, next) => onPageChange(next)}
      rowsPerPage={limit}
      onRowsPerPageChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
      rowsPerPageOptions={ROWS_PER_PAGE}
      labelRowsPerPage="Filas por página"
      labelDisplayedRows={({ from, to, count: total }) => `${from}–${to} de ${total}`}
    />
  );
}
