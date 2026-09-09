import { WaitlistConfirmation } from "./waitlist-confirmation";

type ConfirmationPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const tokenValue = (await searchParams).token;
  const token = typeof tokenValue === "string" ? tokenValue : "";

  return <WaitlistConfirmation token={token} />;
}
