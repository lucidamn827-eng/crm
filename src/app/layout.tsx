import "./globals.css";
export const metadata = {
  title: "Lima Limón · CRM de llamadas",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Lima Limón", statusBarStyle: "black-translucent" as const },
};
export const viewport = { themeColor: "#14532D" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
