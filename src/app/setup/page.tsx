import { redirect } from 'next/navigation';

// /setup is the legacy wizard route. Heard v2 uses the conversational creator at /new.
// Preserved as a redirect so any deep links still resolve.
export default function SetupRedirect() {
  redirect('/new');
}
