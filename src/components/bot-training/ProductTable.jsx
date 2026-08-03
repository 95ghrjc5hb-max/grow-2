import React from "react";
import { Package, Search, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ProductTable({ search, setSearch, products, onEdit, onDelete }) {
  const stockBadge = (status) => {
    const map = {
      in_stock: "bg-green-500/10 text-green-400",
      low_stock: "bg-amber-500/10 text-amber-400",
      out_of_stock: "bg-red-500/10 text-red-400",
    };
    const labels = { in_stock: "In Stock", low_stock: "Low Stock", out_of_stock: "Out of Stock" };
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${map[status] || map.in_stock}`}>
        {labels[status] || status}
      </span>
    );
  };

  const filtered = (products || []).filter(
    (p) => !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Search Bar */}
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="pl-9 bg-white/5 border-white/10"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.02] border-b border-border">
              <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
              <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Price (BDT)</th>
              <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
              <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
              <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-sm text-slate-600">
                  <Package className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                  No products added yet. Click "Add New Product" to get started.
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr key={product.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-white">{product.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-teal-400 font-semibold">৳{product.price?.toLocaleString()}</td>
                  <td className="p-4">{stockBadge(product.stock_status)}</td>
                  <td className="p-4 text-sm text-slate-400 max-w-[250px] truncate">{product.description || "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => onEdit(product)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDelete(product.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
