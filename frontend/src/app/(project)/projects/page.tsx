import { redirect } from 'next/navigation';

/** @deprecated Use /select-project — All Projects hub is no longer a standalone entry. */
export default function AllProjectsPage() {
  redirect('/select-project');
}
