import { redirect } from 'next/navigation';

/** @deprecated Use /select-project — filtered project lists live on the select-project page. */
export default function CompletedProjectsPage() {
  redirect('/select-project');
}
