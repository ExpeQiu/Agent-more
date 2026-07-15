// Root page — redirects to /scenes
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/scenes');
}
