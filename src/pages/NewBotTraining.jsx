import React, { useState, useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewBotTraining() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  
  const [form, setForm] = useState({
    name: "",
    price: "",
    description: "",
    stock_status: "in_stock",
    image_url: "",
  });

  // Fetch products from Supabase
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error("Error fetching products:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Save product to Supabase
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast({ title: "Name and Price are required", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("products")
        .insert([
          {
            name: form.name,
            price: parseFloat(form.price) || 0,
            description: form.description || "",
            stock_status: form.stock_status || "in_stock",
            image_url: form.image_url || "",
          },
        ])
        .select();

      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Product added successfully to Supabase!" });
        setForm({ name: "", price: "", description: "", stock_status: "in_stock", image_url: "" });
        fetchProducts(); // Refresh list
      }
    } catch (err) {
      console.error("Unexpected Error:", err);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-white">
      <h2 className="text-2xl font-bold mb-4">New Bot Training & Inventory</h2>
      
      {/* Form Section */}
      <form onSubmit={handleSaveProduct} className="bg-gray-800 p-4 rounded-lg mb-6 space-y-4">
        <div>
          <label className="block text-sm mb-1">Product Name</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Premium T-Shirt"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Price (BDT)</label>
          <Input
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="e.g., 500"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Description</label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g., Red, Cotton"
          />
        </div>
        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
          Save to Supabase
        </Button>
      </form>

      {/* List Section */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Product List</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {products.map((p) => (
              <li key={p.id} className="border-b border-gray-700 py-2 flex justify-between">
                <span>{p.name}</span>
                <span>BDT {p.price}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
