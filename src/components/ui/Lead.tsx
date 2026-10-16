/** The line under a page title. Phones get the short version, wider screens the full one. */
export function Lead({ long, short, className = "max-w-[640px]" }: { long: string; short: string; className?: string }) {
  return (
    <>
      <p className={`m-0 md:hidden ${className}`}>{short}</p>
      <p className={`m-0 max-md:hidden ${className}`}>{long}</p>
    </>
  );
}
