import type { Metadata } from "next";
import "./globals.css";

// Nota: usamos a stack de fontes do sistema (definida em globals.css) em
// vez de next/font/google, para o build não depender de acesso à rede a
// fonts.googleapis.com (falha em redes corporativas/sandboxes offline).
// Se quiseres o Geist, troca por next/font/local com os ficheiros da
// fonte descarregados para o projeto.

export const metadata: Metadata = {
  title: "Picagem X€Horas",
  description: "Gestão de ponto e calculadora de salário líquido",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
