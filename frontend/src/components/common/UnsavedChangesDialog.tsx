'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UnsavedChangesDialogProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export default function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        data-testid="unsaved-changes-dialog"
        className="sm:max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Leave without saving and your edits will be
            lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            data-testid="unsaved-changes-stay"
            onClick={onStay}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Stay
          </button>
          <button
            type="button"
            data-testid="unsaved-changes-leave"
            onClick={onLeave}
            className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-4 text-sm font-medium text-white shadow-sm transition hover:opacity-95"
          >
            Leave without saving
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
