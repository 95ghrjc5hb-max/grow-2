import React, { useState, useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { Grow } from "@/api/GrowClient";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// Sub-components Import
import AiConfigBanner from "../components/bot-training/AiConfigBanner.jsx";
import ProductTable from "../components/bot-training/ProductTable.jsx";
import ProductModal from "../components/bot-training/ProductModal.jsx";
import BotConfigModal from "../components/bot-training/BotConfigModal.jsx";

export default function BotTraining() {
  const [products, setProducts] = useState([]);
  const [botConfig, setBotConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  
  const [form, setForm] = useState({ name: "", price: "", description: "", stock_status: "in_stock", image_url: "" });
  const [configForm, setConfigForm] = useState({ provider: "Groq Cloud", model: "llama-3.1-8b-instant", api_key: "", system_prompt: "" });
  
     // 1. Fetch Products from Supabase & Bot Config on load
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // Fetch products directly from Supabase
        const { data: supaProds, error } = await supabase.from("products").select("*");
        if (error) {
          console.error("Supabase Fetch Error:", error);
        }
        setProducts(supaProds || []);

          // Fetch Bot Config directly from Supabase table 'bot_configs'
      const { data: configs, error: botErr } = await supabase
        .from("bot_configs")
        .select("*")
        .limit(1);

      if (configs && configs.length > 0) {
        setBotConfig(configs[0]);
        setConfigForm({
          provider: configs[0].llm_provider || "Groq Cloud",
          model: configs[0].model_name || "llama-3.1-8b-instant",
          api_key: configs[0].api_key || "",
          system_prompt: configs[0].system_prompt || "",
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

  // 2. Reset form helper
  const resetForm = () => {
    setForm({ name: "", price: "", description: "", stock_status: "in_stock", image_url: "" });
    setEditingProduct(null);
  };

    // Unified Handle Save for ProductModal
  const handleSaveProduct = async () => {
    // 1. Validation
    if (!form.name || !form.price) {
      toast({ title: "Name and Price are required", variant: "destructive" });
      return;
    }

    try {
      if (editingProduct) {
        // UPDATE Existing Product in Supabase
        const { data, error } = await supabase
          .from("products")
          .update({
            name: form.name,
            price: parseFloat(form.price) || 0,
            description: form.description || "",
            stock_status: form.stock_status || "in_stock",
            image_url: form.image_url || "",
          })
          .eq("id", editingProduct.id)
          .select();

        if (error) throw error;

        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? data[0] : p)));
        toast({ title: "Product updated successfully!" });
      } else {
        // INSERT New Product into Supabase
        const { data, error } = await supabase
          .from("products")
          .insert([
            {
              name: form.name,
              price: parseFloat(form.price) || 0,
              description: form.description || "",
              stock_status: form.stock_status || "in_stock",
              image_url: form.image_url || "",
            }
          ])
          .select();

        if (error) throw error;

        setProducts((prev) => [...prev, data[0]]);
        toast({ title: "Product added to Supabase!" });
      }

      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving product to Supabase:", error);
      toast({
        title: "Failed to save product",
        description: error.message || "Database error",
        variant: "destructive",
      });
    }
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
    try {
      const payload = {
        llm_provider: configForm.provider,
        model_name: configForm.model,
        api_key: configForm.api_key,
        system_prompt: configForm.system_prompt
      };

      if (botConfig && botConfig.id) {
        // UPDATE Existing Config
        const { data, error } = await supabase
          .from("bot_configs")
          .update(payload)
          .eq("id", botConfig.id)
          .select();

        if (error) throw error;
        if (data && data.length > 0) setBotConfig(data[0]);
      } else {
        // INSERT New Config
        const { data, error } = await supabase
          .from("bot_configs")
          .insert([payload])
          .select();

        if (error) throw error;
        if (data && data.length > 0) setBotConfig(data[0]);
      }

      toast({ title: "Bot configuration saved successfully!" });
      setShowConfigModal(false);
    } catch (error) {
      console.error("Save config error:", error);
      toast({
        title: "Failed to save configuration",
        description: error.message || "Database error",
        variant: "destructive"
      });
    }
  };

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
       config={configForm}
       onChange={setConfigForm}
       onSaveSuccess={handleSaveConfig}  
     />
    </div>
  );
}
