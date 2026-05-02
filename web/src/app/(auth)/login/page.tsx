type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f7" }}>
      <form
        action="/api/login"
        method="POST"
        style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", padding: 32, width: 360 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>SEO Forge</h1>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>Enter password</p>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          style={{ width: "100%", border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 14, boxSizing: "border-box" }}
        />
        {sp.error && (
          <p style={{ color: "#c00", fontSize: 13, marginBottom: 12 }}>Invalid password.</p>
        )}
        <button
          type="submit"
          style={{ width: "100%", background: "#2952ff", color: "white", border: 0, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
