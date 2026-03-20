import type { Metadata } from "next";
import "./globals.css";
import { AppSessionProvider } from "./components/AppSessionProvider";

export const metadata: Metadata = {
  title: "智译西电 - 中外合作教学翻译助手",
  description:
    "智译西电是面向中外合作办学理工科学生的教学辅助平台，提供外文教材翻译、专业名词解析与公式推导服务。",
  keywords: ["智译西电", "翻译", "法语", "英语", "教材", "理工科", "中外合作"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
