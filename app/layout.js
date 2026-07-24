import "./globals.css";

export const metadata = {
  title: "Book a Shoot | Yellow Cardinal Media",
  description: "Pick a time, get on the calendar for your listing shoot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-body">
        <div className="grain" />
        {children}
      </body>
    </html>
  );
}
