import React, { useState } from "react";
import { Save, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProductModal({ open, onOpenChange, editingProduct, form, setForm, onSave }) {
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setIsUploading(true);
    const uploadedUrls = [];
    
    for (const file of files) {
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const { error } = await supabase.storage.from('product-images').upload(fileName, file);
      if (!error) {
        const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
        uploadedUrls.push(data.publicUrl);
      }
    }
    
    const currentUrls = form.image_url ? form.image_url.split(',').filter(Boolean) : [];
    setForm({ ...form, image_url: [...currentUrls, ...uploadedUrls].join(',') });
    setIsUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingProduct ? "Edit Product" : "Add New Product"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Product Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Premium T-Shirt"
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Price (BDT) *</label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Stock Status</label>
              <Select value={form.stock_status} onValueChange={(v) => setForm({ ...form, stock_status: v })}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Description / Details</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Sizes, colors, materials..."
              className="bg-white/5 border-white/10 min-h-[80px]"
            />
          </div>
           <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Product Images (Gallery)</label>
          <Input
            type="file" multiple accept="image/*"
            onChange={handleImageUpload} disabled={isUploading}
            className="bg-white/5 border-white/10 text-slate-300 file:bg-teal-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:mr-4 file:cursor-pointer cursor-pointer"
          />
          {isUploading && <p className="text-xs text-teal-400 mt-2 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</p>}
          {form.image_url && <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><ImagePlus className="w-3 h-3" /> {form.image_url.split(',').length} image(s) added.</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isUploading} className="bg-teal-500 hover:bg-teal-600 text-black gap-2">
            <Save className="w-4 h-4" /> {isUploading ? "Uploading..." : (editingProduct ? "Update" : "Add Product")}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

