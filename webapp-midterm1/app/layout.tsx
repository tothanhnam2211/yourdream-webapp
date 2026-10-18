import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bản đồ Toán vào 10 Hà Nội · YOURDREAM",
  description:
    "Khám phá 8 nhánh kiến thức Toán để chuẩn bị thi vào lớp 10. Sơ đồ tương tác, ví dụ, tự kiểm tra và tiến độ ôn tập.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
