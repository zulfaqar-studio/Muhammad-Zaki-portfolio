export function GET() {
  const deepseek = Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
  const drive = Boolean(
    String(process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || "").trim() &&
    String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim() &&
    (
      String(process.env.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || "").trim() ||
      String(process.env.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID || "").trim()
    )
  );

  return Response.json({
    ok: deepseek || drive,
    service: "zaki-public-api",
    deepseek: deepseek ? "configured" : "not-configured",
    driveFallback: drive ? "configured" : "not-configured",
    timestamp: new Date().toISOString()
  });
}
