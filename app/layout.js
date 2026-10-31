import "./globals.css";

export const metadata = {
  title: "Morrowlane Service Request Portal",
  description: "Submit and track workplace service requests",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
