import "./globals.css";

export const metadata = {
  title: "maderino · espace",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "maderino", statusBarStyle: "default" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f1e9df" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital@1&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
