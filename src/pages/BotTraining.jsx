import React, { useState, useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { Grow } from "@/api/GrowClient";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// Sub-components Import
import AIConfigBanner from "../components/bot-training/AIConfigBanner";
import ProductTable from "../components/bot-training/ProductTable";
import ProductModal from "../components/bot-training/ProductModal";
import BotConfigModal from "../components/bot-training/BotConfigModal";

export default function BotTraining() {
  const [products, setProducts] = useState([]);
  const [botConfig, setBotConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [userOrgId, setUserOrgId] = useState(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    price: "",
    description: "",
    stock_status: "in_stock",
    image_url: "",
  });

  const [configForm, setConfigForm] = useState({
    provider: "Groq Cloud",
    model: "llama-3.1-8b-instant",
    api_key: "",
    system_prompt: "",
  });

  // 1. Fetch Products & Bot Config from Supabase on load
   // 1. Fetch Products & Bot Config from Supabase on load
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setProducts([]);
          setLoading(false);
          return;
        }

        // Fetch Organization ID
        const { data: memberData } = await supabase
          .from("organization_members")
          .select("org_id")
          .eq("user_id", user.id);

        const currentOrgId = memberData && memberData.length > 0 ? memberData[0].org_id : null;
        setUserOrgId(currentOrgId);

        // BULLETPROOF FETCH LOGIC: Fetch by org_id OR user_id
        let query = supabase.from("products").select("*");
        if (currentOrgId) {
          query = query.or(`org_id.eq.${currentOrgId},user_id.eq.${user.id}`);
        } else {
          query = query.eq("user_id", user.id);
        }

        const { data: supaProds, error: prodError } = await query;

        if (prodError) {
          console.error("Supabase Fetch Error:", prodError);
        } else {
          console.log("Successfully fetched products:", supaProds);
        }

        setProducts(supaProds || []);

        // Fetch Bot Config
        const { data: configs } = await supabase.from("bot_configs").select("*").limit(1);
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
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

    const handleSaveProduct = async () => {
    if (!form.name || !form.price) {
      toast({ title: "Name and Price are required", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please login first", variant: "destructive" });
        return;
      }

      let activeOrgId = userOrgId;
      if (!activeOrgId) {
        const { data: memberData } = await supabase
          .from("organization_members")
          .select("org_id")
          .eq("user_id", user.id);
        if (memberData && memberData.length > 0) {
          activeOrgId = memberData[0].org_id;
          setUserOrgId(activeOrgId);
        }
      }

      // PAYLOAD WITH BOTH ORG_ID AND USER_ID
      const payload = {
        name: form.name,
        price: parseFloat(form.price) || 0,
        description: form.description || "",
        stock_status: form.stock_status || "in_stock",
        image_url: form.image_url || "",
        org_id: activeOrgId,
        user_id: user.id // <-- This ensures it never gets lost!
      };

      if (editingProduct) {
        const { data, error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProduct.id)
          .select();

        if (error) throw error;
        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? data[0] : p)));
        toast({ title: "Product updated successfully!" });
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert([payload])
          .select();

        if (error) throw error;
        setProducts((prev) => [...prev, data[0]]);
        toast({ title: "Product added to Supabase!" });
      }

      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving product:", error);
      toast({
        title: "Failed to save product",
        description: error.message || "Database error",
        variant: "destructive",
      });
    }
  };


    const handleDelete = async (id) => {
    try {
      // Direct Supabase call with product id
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Update state to immediately reflect in UI
      setProducts((prev) => prev.filter((p) => p.id !== id));

      toast({
        title: "Product Deleted",
        description: "The item has been removed successfully.",
      });
    } catch (err) {
      console.error("Delete Error:", err);
      toast({
        title: "Failed to delete",
        description: err.message || "Could not delete product.",
        variant: "destructive",
      });
    }
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

  const handleSaveConfig = async (formData) => { 
    try {
        const payload = {
            llm_provider: formData.provider,
            model_name: formData.model,
            api_key: formData.api_key,
            system_prompt: formData.system_prompt, 
            org_id: userOrgId,
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
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Training & Inventory</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage products and configure your AI bot
          </p>
        </div>
                <div className="flex gap-3">
          <Button 
            onClick={() => setShowConfigModal(true)} 
            variant="outline" 
            className="gap-2 border-white/10 text-white hover:bg-white/5"
          >
            <Settings2 className="w-4 h-4" /> Bot Config
          </Button>
          
          <Button
            onClick={() => {
              // Clear input fields to prepare for adding a new product
              setForm({
                name: "",
                price: "",
                description: "",
                stock_status: "in_stock",
                image_url: "",
              });
              setEditingProduct(null); 
              setShowModal(true);
            }}
            className="gap-2 bg-teal-500 hover:bg-teal-600 text-slate-950 font-medium"
          >
            <Plus className="w-4 h-4" /> Add New Product
          </Button>
        </div>
      </div>

      {/* AI Config Banner Component */}
      <AIConfigBanner model={configForm.model} apiKey={botConfig?.api_key} />

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
