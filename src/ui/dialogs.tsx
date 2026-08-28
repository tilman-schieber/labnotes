import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Promise-based replacements for window.prompt / window.confirm. `DialogHost` is mounted once at
// the root; the functions below can be called from anywhere, including non-React code such as
// ProseMirror node views.

export type PromptOptions = {
  title: string;
  message?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
  // Return an error message to block submission.
  validate?: (value: string) => string | null;
};

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptRequest = { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };
type ConfirmRequest = { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void };
type Request = PromptRequest | ConfirmRequest;

let enqueue: ((request: Request) => void) | null = null;
const pending: Request[] = [];

function submit(request: Request) {
  if (enqueue) {
    enqueue(request);
  } else {
    pending.push(request);
  }
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => submit({ kind: 'prompt', options, resolve }));
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => submit({ kind: 'confirm', options, resolve }));
}

function PromptView({ request, onDone }: { request: PromptRequest; onDone: () => void }) {
  const { options } = request;
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const cancel = () => {
    request.resolve(null);
    onDone();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = options.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    request.resolve(value);
    onDone();
  };

  return (
    <form className="dialog" onSubmit={handleSubmit}>
      <div className="dialog-title">{options.title}</div>
      {options.message && <div className="dialog-message">{options.message}</div>}
      <label className="dialog-field">
        {options.label && <span>{options.label}</span>}
        {options.multiline ? (
          <textarea
            ref={(node) => {
              inputRef.current = node;
            }}
            rows={3}
            value={value}
            placeholder={options.placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel();
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleSubmit(event);
            }}
          />
        ) : (
          <input
            ref={(node) => {
              inputRef.current = node;
            }}
            type="text"
            value={value}
            placeholder={options.placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel();
            }}
          />
        )}
      </label>
      {error && <div className="dialog-error">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {options.confirmLabel ?? 'OK'}
        </button>
      </div>
    </form>
  );
}

function ConfirmView({ request, onDone }: { request: ConfirmRequest; onDone: () => void }) {
  const { options } = request;
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const finish = (value: boolean) => {
    request.resolve(value);
    onDone();
  };

  return (
    <div
      className="dialog"
      role="alertdialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') finish(false);
      }}
    >
      <div className="dialog-title">{options.title}</div>
      {options.message && <div className="dialog-message">{options.message}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => finish(false)}>
          {options.cancelLabel ?? 'Cancel'}
        </button>
        <button ref={confirmRef} type="button" className={`btn ${options.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => finish(true)}>
          {options.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </div>
  );
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  // Dismiss on backdrop only when the press started there too, so a drag that ends on the
  // backdrop (or a synthetic click sequence) cannot close the dialog by accident.
  const pressOnBackdrop = useRef(false);

  useEffect(() => {
    enqueue = (request) => setQueue((current) => [...current, request]);
    if (pending.length > 0) {
      setQueue((current) => [...current, ...pending.splice(0)]);
    }
    return () => {
      enqueue = null;
    };
  }, []);

  const active = queue[0];
  if (!active) {
    return null;
  }

  const done = () => setQueue((current) => current.slice(1));
  const cancelActive = () => {
    if (active.kind === 'prompt') active.resolve(null);
    else active.resolve(false);
    done();
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        pressOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressOnBackdrop.current && event.target === event.currentTarget) {
          cancelActive();
        }
        pressOnBackdrop.current = false;
      }}
    >
      <div className="modal dialog-modal" role="dialog" aria-modal="true" aria-label={active.options.title}>
        {active.kind === 'prompt' ? (
          <PromptView key={queue.length} request={active} onDone={done} />
        ) : (
          <ConfirmView key={queue.length} request={active} onDone={done} />
        )}
      </div>
    </div>,
    document.body
  );
}
