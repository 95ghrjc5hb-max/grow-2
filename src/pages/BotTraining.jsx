import React, { useState, useEffect } from "react";
import { Grow } from "@/api/GrowClient";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// Sub-components Import
import AiConfigBanner from "@/components/bot-training/AiConfigBanner";
import ProductTable from "@/components/bot-training/ProductTable";
import ProductModal from "@/components/bot-training/ProductModal";
import BotConfigModal from "@/components/bot-training/BotConfigModal";

export default function BotTraining() {
  const [products, setProducts] = useState([]);
  const [botConfig, setBotConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState("");
  
  const [form, setForm] = useState({ name: "", price: "", description: "", stock_status: "in_stock", image_url: "" });
  const [configForm, setConfigForm] = useState({ provider: "Groq Cloud", model: "llama-3.1-8b-instant", api_key: "", system_prompt: "" });
  
  const { toast } = useToast();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [prods, configs] = await Promise.all([
          Grow.entities.Product.list().catch(() => []),
          Grow.entities.BotConfig.list().catch(() => []),
        ]);
        
        setProducts(prods || []);
        if (configs && configs.length > 0) {
          setBotConfig(configs[0]);
          setConfigForm({
            provider: configs[0]?.provider || "Groq Cloud",
            model: configs[0]?.model || "llama-3.1-8b-instant",
            api_key: configs[0]?.api_key || "",
            system_prompt: configs[0]?.system_prompt || "",
          });
        }
      } catch (error) {
        console.error("BotTraining fetch error:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({ name: "", price: "", description: "", stock_status: "in_stock", image_url: "" });
    setEditingProduct(null);
  };

  const handleSaveProduct = async () => {
    if (!form.name || !form.price) {
      toast({ title: "Name and Price are required", variant: "destructive" });
      return;
    }
    const data = { ...form, price: parseFloat(form.price) };
    if (editingProduct) {
      await Grow.entities.Product.update(editingProduct.id, data);
      setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? { ...p, ...data } : p)));
      toast({ title: "Product updated" });
    } else {
      const created = await Grow.entities.Product.create(data);
      setProducts((prev) => [...prev, created]);
      toast({ title: "Product added" });
    }
    setShowModal(false);
    resetForm();
  };

  const handleDelete = async (id) => {
    await Grow.entities.Product.delete(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "Product deleted" });
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: String(product.price),
      description: product.description || "",
      stock_status: product.stock_status || "in_stock",
      image_url: product.image_url || "",
    });
    setShowModal(true);
  };

  const handleSaveConfig = async () => {
    if (botConfig) {
      await Grow.entities.BotConfig.update(botConfig.id, configForm);
      setBotConfig({ ...botConfig, ...configForm });
    } else {
      const created = await Grow.entities.BotConfig.create(configForm);
      setBotConfig(created);
    }
    toast({ title: "Bot configuration saved" });
    setShowConfigModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Training & Inventory</h1>
          <p className="text-slate-500 mt-1">Manage products and configure your AI bot</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowConfigModal(true)} variant="outline" className="gap-2 border-white/10 text-slate-300 hover:bg-white/5">
            <Settings2 className="w-4 h-4" /> Bot Config
          </Button>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="gap-2 bg-teal-500 hover:bg-teal-600 text-black">
            <Plus className="w-4 h-4" /> Add New Product
          </Button>
        </div>
      </div>

      {/* AI Config Banner Component */}
      <AiConfigBanner model={configForm.model} apiKey={botConfig?.api_key} />

      {/* Product Table Component */}
      <ProductTable
        search={search}
        setSearch={setSearch}
        products={products}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Product Add/Edit Modal Component */}
      <ProductModal
        open={showModal}
        onOpenChange={setShowModal}
        editingProduct={editingProduct}
        form={form}
        setForm={setForm}
        onSave={handleSaveProduct}
      />

      {/* Bot Config Modal Component */}
      <BotConfigModal
        open={showConfigModal}
        onOpenChange={setShowConfigModal}
        configForm={configForm}
        setConfigForm={setConfigForm}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
