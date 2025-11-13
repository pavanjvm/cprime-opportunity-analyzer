import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function issueJwtToken(accessToken: string, userId: string) {
  const decoded = jwt.decode(accessToken) as any;
  const email =
    decoded?.unique_name ||
    decoded?.preferred_username ||
    decoded?.upn ||
    decoded?.email;
  console.log("email_id is",email)
  

  if (!email) throw new Error("No email found in access token");

  return jwt.sign({ email, userId }, JWT_SECRET, { expiresIn: "45m" });
}

export function verifyJwtToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { status: "Authorized", payload };
  } catch (err: any) {
    return { status: err.name, payload: {} };
  }
}
