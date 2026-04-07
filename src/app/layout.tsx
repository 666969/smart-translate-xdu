import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppSessionProvider } from "./components/AppSessionProvider";
import { AuthProvider } from "./components/auth/AuthProvider";

const inter = localFont({
  src: "../../src/fonts/Inter.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const notoSansSc = localFont({
  src: "../../src/fonts/NotoSansSC-Regular.ttf",
  variable: "--font-noto-sans-sc",
  display: "swap",
  weight: "400",
});

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
      <body className={`${inter.variable} ${notoSansSc.variable} antialiased`}>
        <AuthProvider>
          <AppSessionProvider>{children}</AppSessionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
