import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';

export interface UpdatePromptProps {
  /** Whether a newer service worker is waiting to take over. */
  open: boolean;
  /** Activates the waiting worker and reloads. */
  onUpdate: () => void;
  /** Dismisses until the next page load. */
  onDismiss: () => void;
}

/**
 * "A new version is available" prompt.
 *
 * Presentational only — it knows nothing about service workers, so it stays
 * testable and free of any build-time virtual module. Each app wires it to its
 * own registration in `src/pwa/PwaUpdater.tsx`.
 *
 * This is a prompt rather than an automatic reload on purpose: reloading under
 * a cashier mid-order (or under a half-filled product form) loses in-memory
 * state with no way to recover it.
 */
export function UpdatePrompt({ open, onUpdate, onDismiss }: UpdatePromptProps) {
  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // No autoHideDuration: the user should decide when to take the update,
      // not lose the offer because they looked away.
      onClose={(_, reason) => {
        if (reason === 'clickaway') return;
        onDismiss();
      }}
    >
      <Alert
        severity="info"
        variant="filled"
        data-testid="pwa-update-prompt"
        action={
          <>
            <Button color="inherit" size="small" onClick={onUpdate}>
              Actualizar
            </Button>
            <Button color="inherit" size="small" onClick={onDismiss}>
              Ahora no
            </Button>
          </>
        }
      >
        Nueva versión disponible
      </Alert>
    </Snackbar>
  );
}
