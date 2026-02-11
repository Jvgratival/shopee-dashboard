import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-purple-50 flex items-center justify-center">
      <div className="bg-white shadow-xl rounded-2xl p-10 text-center w-96">
        <h1 className="text-3xl font-bold text-purple-700">
          Shopee Insight Privado
        </h1>

        <p className="text-gray-600 mt-4">
          Seu painel inteligente de comissão.
        </p>

        <Link
          href="/login"
          className="inline-block mt-6 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
