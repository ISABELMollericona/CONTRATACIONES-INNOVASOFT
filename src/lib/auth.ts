import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
);

/**
 * Acceso de prueba SOLO para desarrollo local: permite entrar con cualquier correo
 * sin Google. Nunca se activa en producción, aunque la variable esté definida.
 */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.LOCAL_DEV_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }));
}
if (devLoginEnabled) {
  providers.push(CredentialsProvider({
    id: "dev-login",
    name: "Acceso de prueba local",
    credentials: { email: { label: "Correo", type: "email" } },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
      return { id: email, email, name: email.split("@")[0] };
    },
  }));
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      const allowed = account?.provider === "google" || (devLoginEnabled && account?.provider === "dev-login");
      if (!allowed || !user.email) return false;
      await connectDb();
      const email = user.email.toLowerCase();
      const role = adminEmails.has(email) ? "admin" : "customer";
      await User.findOneAndUpdate(
        { email },
        { $set: { email, name: user.name ?? email, image: user.image ?? "", role } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
        token.role = adminEmails.has(user.email.toLowerCase()) ? "admin" : "customer";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? "";
        session.user.role = token.role === "admin" ? "admin" : "customer";
      }
      return session;
    },
  },
  pages: { signIn: "/" },
};
