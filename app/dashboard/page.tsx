"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const router = useRouter();

  const [graficoData, setGraficoData] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [pedidosBase, setPedidosBase] = useState<any[]>([]);

  const [origemStats, setOrigemStats] = useState({
    direto: { comissao: 0, pedidos: 0 },
    indireto: { comissao: 0, pedidos: 0 },
  });

  const [canalStats, setCanalStats] = useState<any[]>([]);
  const [subidStats, setSubidStats] = useState<any[]>([]);

  const [filtroAtribuicao, setFiltroAtribuicao] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  const [analise, setAnalise] = useState({
    comissaoConfirmada: 0,
    comissaoPrevista: 0,
    comissaoTotal: 0,
    vendasGeradas: 0,
    pedidosUnicos: 0,
  });

  const [ordem, setOrdem] = useState({
    campo: "comissaoTotal",
    asc: false,
  });

  useEffect(() => {
    const logado = localStorage.getItem("logado");
    if (logado !== "true") {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (pedidosBase.length > 0) {
      processarDados(pedidosBase);
    }
  }, [filtroAtribuicao, filtroStatus]);

  const handleLogout = () => {
    localStorage.removeItem("logado");
    router.push("/login");
  };

  const converterValor = (valor: any) => {
    if (!valor) return 0;
    if (typeof valor === "number") return valor;
    if (typeof valor === "string") {
      return parseFloat(valor.replace(",", ".")) || 0;
    }
    return 0;
  };

  const ordenar = (campo: string) => {
    const asc = ordem.campo === campo ? !ordem.asc : false;

    const novaLista = [...produtos].sort((a: any, b: any) => {
      if (typeof a[campo] === "string") {
        return asc
          ? a[campo].localeCompare(b[campo])
          : b[campo].localeCompare(a[campo]);
      }
      return asc ? a[campo] - b[campo] : b[campo] - a[campo];
    });

    setOrdem({ campo, asc });
    setProdutos(novaLista);
  };

  const handleFileUpload = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;

    setProdutos([]);
    setGraficoData([]);
    setPedidosBase([]);
    setSubidStats([]);
    setCanalStats([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const pedidos = results.data as any[];
        setPedidosBase(pedidos);
        processarDados(pedidos);
      },
    });
  };

  const processarDados = (pedidos: any[]) => {
    let comissaoConfirmada = 0;
    let comissaoPrevista = 0;
    let vendasGeradas = 0;

    let diretoComissao = 0;
    let indiretoComissao = 0;
    let diretoPedidos = 0;
    let indiretoPedidos = 0;

    const agrupadoPorDia: any = {};
    const mapaProdutos = new Map();
    const mapaSubid = new Map();
    const mapaCanal = new Map();

    pedidos.forEach((pedido) => {
      const status = (pedido["Status do Pedido"] || "").toString().trim();

      const atribuicaoRaw = (pedido["Tipo de atribuição"] || "")
        .toString()
        .toLowerCase()
        .trim();

      let atribuicao = "Indireto";
      if (atribuicaoRaw.includes("mesma loja")) atribuicao = "Direto";

      if (
        (filtroAtribuicao !== "Todos" &&
          atribuicao !== filtroAtribuicao) ||
        (filtroStatus !== "Todos" && status !== filtroStatus)
      ) {
        return;
      }

      const nome = pedido["Nome do Item"];
      const loja = pedido["ID da loja"];
      const itemId = pedido["ID do item"];
      const qtd = Number(pedido["Qtd"] || 1);

      const comissaoLiquida = converterValor(
        pedido["Comissão líquida do afiliado(R$)"]
      );

      const comissaoTotalPedido = converterValor(
        pedido["Comissão total do pedido(R$)"]
      );

      const valorVenda = converterValor(
        pedido["Valor de Compra(R$)"]
      );

      const valorParaGrafico =
        status === "Concluído"
          ? comissaoLiquida
          : comissaoLiquida > 0
          ? comissaoLiquida
          : comissaoTotalPedido;

      if (status === "Concluído") {
        comissaoConfirmada += comissaoLiquida;
        vendasGeradas += valorVenda;
      }

      if (status === "Pendente") {
        const prevista =
          comissaoLiquida > 0 ? comissaoLiquida : comissaoTotalPedido;

        comissaoPrevista += prevista;
        vendasGeradas += valorVenda;
      }

      if (status === "Concluído" || status === "Pendente") {

        if (atribuicao === "Direto") {
          diretoComissao += valorParaGrafico;
          diretoPedidos += 1;
        } else {
          indiretoComissao += valorParaGrafico;
          indiretoPedidos += 1;
        }

        const dataPedido = pedido["Horário do pedido"];
        if (dataPedido) {
          const dia = dataPedido.split(" ")[0];
          if (!agrupadoPorDia[dia]) agrupadoPorDia[dia] = 0;
          agrupadoPorDia[dia] += valorParaGrafico;
        }

        const chave = `${loja}-${itemId}-${atribuicao}`;

        if (!mapaProdutos.has(chave)) {
          mapaProdutos.set(chave, {
            nome,
            loja,
            itemId,
            atribuicao,
            qtdVendida: 0,
            comissaoTotal: 0,
            potencialPerdido: 0,
          });
        }

        const produto = mapaProdutos.get(chave);
        produto.qtdVendida += qtd;
        produto.comissaoTotal += valorParaGrafico;

        // SUBID
        for (let i = 1; i <= 5; i++) {
          const subidRaw = pedido[`Sub_id${i}`];
          if (typeof subidRaw === "string") {
            const subid = subidRaw.trim();
            if (subid !== "") {
              if (!mapaSubid.has(subid)) {
                mapaSubid.set(subid, {
                  nome: subid,
                  comissao: 0,
                  pedidos: 0,
                });
              }
              const sub = mapaSubid.get(subid);
              sub.comissao += valorParaGrafico;
              sub.pedidos += 1;
            }
          }
        }

        // CANAL
        const canalRaw = pedido["Canal"];
        if (typeof canalRaw === "string") {
          const canal = canalRaw.trim();
          if (canal !== "") {
            if (!mapaCanal.has(canal)) {
              mapaCanal.set(canal, {
                nome: canal,
                comissao: 0,
                pedidos: 0,
              });
            }
            const canalObj = mapaCanal.get(canal);
            canalObj.comissao += valorParaGrafico;
            canalObj.pedidos += 1;
          }
        }
      }
    });

    setOrigemStats({
      direto: { comissao: diretoComissao, pedidos: diretoPedidos },
      indireto: { comissao: indiretoComissao, pedidos: indiretoPedidos },
    });

    setSubidStats(
      Array.from(mapaSubid.values()).sort(
        (a: any, b: any) => b.comissao - a.comissao
      )
    );

    setCanalStats(
      Array.from(mapaCanal.values()).sort(
        (a: any, b: any) => b.comissao - a.comissao
      )
    );

    const dadosGrafico = Object.keys(agrupadoPorDia).map((dia) => ({
      dia,
      comissao: agrupadoPorDia[dia],
    }));

    const listaOrdenada = Array.from(mapaProdutos.values()).sort(
      (a: any, b: any) => b.comissaoTotal - a.comissaoTotal
    );

    setProdutos(listaOrdenada);
    setGraficoData(dadosGrafico);

    setAnalise({
      comissaoConfirmada,
      comissaoPrevista,
      comissaoTotal: comissaoConfirmada + comissaoPrevista,
      vendasGeradas,
      pedidosUnicos: pedidos.length,
    });
  };

  const totalComissao =
    origemStats.direto.comissao + origemStats.indireto.comissao;

  const totalPedidos =
    origemStats.direto.pedidos + origemStats.indireto.pedidos;

  const percDiretoComissao =
    totalComissao > 0
      ? (origemStats.direto.comissao / totalComissao) * 100
      : 0;

  const percIndiretoComissao =
    totalComissao > 0
      ? (origemStats.indireto.comissao / totalComissao) * 100
      : 0;

  const percDiretoPedidos =
    totalPedidos > 0
      ? (origemStats.direto.pedidos / totalPedidos) * 100
      : 0;

  const percIndiretoPedidos =
    totalPedidos > 0
      ? (origemStats.indireto.pedidos / totalPedidos) * 100
      : 0;

  const ticketDireto =
    origemStats.direto.pedidos > 0
      ? origemStats.direto.comissao / origemStats.direto.pedidos
      : 0;

  const ticketIndireto =
    origemStats.indireto.pedidos > 0
      ? origemStats.indireto.comissao / origemStats.indireto.pedidos
      : 0;
  return (
    <main className="min-h-screen bg-purple-50 p-10">
      <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-8">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-purple-700">
            Análise de Comissão
          </h1>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Sair
          </button>
        </div>

        {/* FILTROS */}
        <div className="flex gap-4 mt-6">
          <select
            value={filtroAtribuicao}
            onChange={(e) => setFiltroAtribuicao(e.target.value)}
            className="px-4 py-2 rounded-full border border-purple-400 bg-white text-purple-700 font-semibold shadow-sm"
          >
            <option>Todos</option>
            <option>Direto</option>
            <option>Indireto</option>
          </select>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-4 py-2 rounded-full border border-purple-400 bg-white text-purple-700 font-semibold shadow-sm"
          >
            <option>Todos</option>
            <option>Concluído</option>
            <option>Pendente</option>
          </select>
        </div>

        {/* UPLOAD */}
        <div className="mt-6">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="px-4 py-2 border border-purple-400 bg-white text-purple-700 font-semibold rounded-full shadow-sm"
          />
        </div>

        {/* CARDS SUPERIORES (ANÁLISE DE COMISSÃO) */}
        <div className="grid grid-cols-5 gap-4 mt-8">
          <Card titulo="Comissão Confirmada" valor={analise.comissaoConfirmada} cor="purple" />
          <Card titulo="Comissão Prevista" valor={analise.comissaoPrevista} cor="blue" />
          <Card titulo="Comissão Total" valor={analise.comissaoTotal} cor="green" />
          <Card titulo="Vendas Geradas" valor={analise.vendasGeradas} cor="yellow" />
          <Card titulo="Pedidos" valor={analise.pedidosUnicos} cor="pink" numero />
        </div>

        {/* GRÁFICO */}
        {graficoData.length > 0 && (
          <div className="mt-12">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={graficoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="comissao"
                  stroke="#7c3aed"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* PERFORMANCE POR ORIGEM */}
        {(totalComissao > 0 || totalPedidos > 0) && (
          <div className="mt-16">
            <h2 className="text-xl font-bold text-purple-800 mb-6">
              Performance por Origem
            </h2>

            <div className="grid grid-cols-2 gap-8">

              {/* DIRETO */}
              <div className="bg-green-50 p-6 rounded-2xl border border-green-200">
                <h3 className="text-lg font-bold text-green-700">Direto</h3>

                <div className="mb-6">
                  <div className="flex justify-between font-semibold text-green-800">
                    <span>Comissão</span>
                    <span>
                      R$ {origemStats.direto.comissao.toFixed(2)} ({percDiretoComissao.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-green-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-3 bg-green-600"
                      style={{ width: `${percDiretoComissao}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-green-800">
                    <span>Pedidos</span>
                    <span>
                      {origemStats.direto.pedidos} ({percDiretoPedidos.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-green-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-3 bg-green-600"
                      style={{ width: `${percDiretoPedidos}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 text-sm font-semibold text-green-700">
                  Ticket médio: R$ {ticketDireto.toFixed(2)}
                </div>
              </div>

              {/* INDIRETO */}
              <div className="bg-red-50 p-6 rounded-2xl border border-red-200">
                <h3 className="text-lg font-bold text-red-700">Indireto</h3>

                <div className="mb-6">
                  <div className="flex justify-between font-semibold text-red-800">
                    <span>Comissão</span>
                    <span>
                      R$ {origemStats.indireto.comissao.toFixed(2)} ({percIndiretoComissao.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-red-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-3 bg-red-600"
                      style={{ width: `${percIndiretoComissao}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-red-800">
                    <span>Pedidos</span>
                    <span>
                      {origemStats.indireto.pedidos} ({percIndiretoPedidos.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-red-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-3 bg-red-600"
                      style={{ width: `${percIndiretoPedidos}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 text-sm font-semibold text-red-700">
                  Ticket médio: R$ {ticketIndireto.toFixed(2)}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* NOVO CARD COMBINADO */}
        {(canalStats.length > 0 || subidStats.length > 0) && (
          <div className="mt-16">
            <h2 className="text-xl font-bold text-purple-800 mb-6">
              Performance por Canal e SubID
            </h2>

            <div className="grid grid-cols-2 gap-8">

              {/* CANAL */}
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
                <h3 className="text-lg font-bold text-blue-700 mb-4">
                  Canal
                </h3>

                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
                  {canalStats.map((canal: any, index: number) => (
                    <div key={index} className="bg-white p-4 rounded-xl shadow-sm">
                      <div className="flex justify-between font-semibold text-blue-800">
                        <span>{canal.nome}</span>
                        <span>R$ {canal.comissao.toFixed(2)}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {canal.pedidos} pedidos
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SUBID */}
              <div className="bg-purple-50 p-6 rounded-2xl border border-purple-200">
                <h3 className="text-lg font-bold text-purple-700 mb-4">
                  SubID
                </h3>

                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
                  {subidStats.map((sub: any, index: number) => (
                    <div key={index} className="bg-white p-4 rounded-xl shadow-sm">
                      <div className="flex justify-between font-semibold text-purple-800">
                        <span>{sub.nome}</span>
                        <span>R$ {sub.comissao.toFixed(2)}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {sub.pedidos} pedidos
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* RANKING */}
        {produtos.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-bold text-purple-800 mb-6">
              Ranking de Produtos
            </h2>

            <div className="max-h-[1000px] overflow-y-auto border border-purple-100 rounded-xl">

              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-purple-100 to-purple-50 text-purple-900 uppercase tracking-wide text-xs shadow-sm">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Produto</th>
                    <th
                      className="p-3 cursor-pointer"
                      onClick={() => ordenar("atribuicao")}
                    >
                      Atribuição ⬍
                    </th>
                    <th
                      className="p-3 cursor-pointer"
                      onClick={() => ordenar("potencialPerdido")}
                    >
                      Potencial ⬍
                    </th>
                    <th
                      className="p-3 cursor-pointer"
                      onClick={() => ordenar("qtdVendida")}
                    >
                      Qtd ⬍
                    </th>
                    <th
                      className="p-3 cursor-pointer"
                      onClick={() => ordenar("comissaoTotal")}
                    >
                      Comissão ⬍
                    </th>
                  </tr>
                </thead>

                <tbody className="text-gray-800">
                  {produtos.map((produto: any, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-purple-50 transition duration-200"
                    >
                      <td className="py-3 px-3 font-semibold text-purple-700">
                        {index + 1}
                      </td>

                      <td className="py-3 px-3">
                        {produto.nome}
                      </td>

                      <td className="py-3 px-3">
                        {produto.atribuicao === "Direto" ? (
                          <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs">
                            Direto
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-semibold text-xs">
                            Indireto
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs">
                          R$ {(produto.potencialPerdido || 0).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {produto.qtdVendida}
                      </td>

                      <td className="py-3 px-3 text-purple-800 font-semibold">
                        R$ {produto.comissaoTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          </div>
        )}

      </div>
    </main>
  );
}

function Card({ titulo, valor, cor, numero }: any) {
  const cores: any = {
    purple: "bg-purple-100 text-purple-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    pink: "bg-pink-100 text-pink-700",
  };

  return (
    <div className={`p-4 rounded-lg text-center ${cores[cor]}`}>
      <p className="text-sm text-gray-600">{titulo}</p>
      <p className="text-xl font-bold mt-2">
        {numero ? valor : `R$ ${valor.toFixed(2)}`}
      </p>
    </div>
  );
}
