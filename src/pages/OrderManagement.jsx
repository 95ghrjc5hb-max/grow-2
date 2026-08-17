import React, { useState, useEffect } from "react";
import { Search, Check, Pencil, X, Truck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import ChannelIcon from "@/components/shared/ChannelIcon";
import axios from "axios";

export default function OrderManagement() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { toast } = useToast();

  // 🛡️ SECURITY: Smart Extractor for Supabase Token
  const getTokenAndOrgId = () => {
    let token = "";
    let myOrgId = null;

    // Loop through Local Storage to find the Supabase auth key dynamically
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const sessionData = JSON.parse(localStorage.getItem(key));
          token = sessionData.access_token || "";
          myOrgId = sessionData.user?.id || null;
          break; // Found it, stop looping
        } catch (e) {
          console.error("Failed to parse Supabase session data");
        }
      }
    }
    return { token, myOrgId };
  };

  useEffect(() => {
    async function loadOrders() {
      try {
        setLoading(true);
        const { token, myOrgId } = getTokenAndOrgId();
        
        // Add Authorization header for backend verification
        const config = {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        };

        const response = await axios.get("http://localhost:5000/api/v1/orders", config);
        
        let fetchedData = [];
        if (Array.isArray(response.data)) {
          fetchedData = response.data;
        } else if (response.data?.data && Array.isArray(response.data.data)) {
          fetchedData = response.data.data;
        } else if (response.data?.data?.orders && Array.isArray(response.data.data.orders)) {
          fetchedData = response.data.data.orders;
        } else if (response.data?.orders && Array.isArray(response.data.orders)) {
          fetchedData = response.data.orders;
        }

        // 🔥 MULTI-TENANCY FILTER
        if (myOrgId) {
          fetchedData = fetchedData.filter(order => order.org_id === myOrgId);
        }

        setOrders(fetchedData);
        
      } catch (error) {
        console.error("Order load error from your servers", error);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    loadOrders();
  }, []);

  const filtered = (orders || []).filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.customer_name?.toLowerCase().includes(s) || 
           o.order_id?.toLowerCase().includes(s) || 
           o.products?.toLowerCase().includes(s);
  });

  const handleConfirm = async (order) => {
    try {
      const { token } = getTokenAndOrgId();
      await axios.patch(`http://localhost:5000/api/v1/orders/${order.id}`, { status: "confirmed" }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "confirmed" } : o));
      toast({ title: `Order confirmed on your server` });
    } catch (e) {
      toast({ title: "Failed to update status on server", variant: "destructive" });
    }
  };

  const handleCancel = async (order) => {
    try {
      const { token } = getTokenAndOrgId();
      await axios.patch(`http://localhost:5000/api/v1/orders/${order.id}`, { status: "cancelled" }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "cancelled" } : o));
      toast({ title: `Order cancelled on your server` });
    } catch (e) {
      toast({ title: "Failed to cancel order on server", variant: "destructive" });
    }
  };

  const handleEditOpen = (order) => {
    setEditOrder(order);
    setEditForm({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      address: order.address || "",
      products: order.products || "",
      total_amount: String(order.total_amount || ""),
    });
  };

  const handleEditSave = async () => {
    try {
      const { token } = getTokenAndOrgId();
      const data = { ...editForm, total_amount: parseFloat(editForm.total_amount) || 0 };
      await axios.put(`http://localhost:5000/api/v1/orders/${editOrder.id}`, data, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setOrders(prev => prev.map(o => o.id === editOrder.id ? { ...o, ...data } : o));
      setEditOrder(null);
      toast({ title: "Order updated directly in your database" });
    } catch (e) {
      toast({ title: "Failed to update order on server", variant: "destructive" });
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: "bg-amber-500/10 text-amber-400",
      confirmed: "bg-green-500/10 text-green-400",
      shipped: "bg-blue-500/10 text-blue-400",
      cancelled: "bg-red-500/10 text-red-400",
    };
    return <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${map[status] || map.pending}`}>{status || "pending"}</span>;
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Order Management</h1>
          <p className="text-slate-500 mt-1">Track and manage customer orders on your private server</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="px-3 py-1.5 rounded-lg bg-white/5">{orders.length} total orders</span>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Search by name, order ID, or product..." 
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500" 
        />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/10 text-left">
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Address</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-slate-600">
                    <Truck className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                    No orders found on your server database.
                  </td>
                </tr>
              ) : (
                filtered.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 text-sm font-mono text-teal-400">{order.order_id || 'N/A'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {order.channel && <ChannelIcon channel={order.channel} />}
                        <span className="text-sm text-white">{order.customer_name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{order.customer_phone || "-"}</td>
                    <td className="p-4 text-sm text-slate-400 max-w-[180px] truncate">{order.address || "-"}</td>
                    <td className="p-4 text-sm text-slate-300">{order.products || "-"}</td>
                    <td className="p-4 text-sm font-semibold text-teal-400">৳{Number(order.total_amount || 0).toLocaleString()}</td>
                    <td className="p-4">{statusBadge(order.status)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        {order.status === "pending" && (
                          <button onClick={() => handleConfirm(order)} className="p-2 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleEditOpen(order)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {order.status !== "cancelled" && (
                          <button onClick={() => handleCancel(order)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editOrder} onOpenChange={(v) => !v && setEditOrder(null)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Order - {editOrder?.order_id || 'N/A'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Customer Name</label>
              <Input value={editForm.customer_name} onChange={e => setEditForm({...editForm, customer_name: e.target.value})} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Phone Number</label>
              <Input value={editForm.customer_phone} onChange={e => setEditForm({...editForm, customer_phone: e.target.value})} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Shipping Address</label>
              <Input value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Product</label>
                <Input value={editForm.products} onChange={e => setEditForm({...editForm, products: e.target.value})} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Total Price (৳)</label>
                <Input value={editForm.total_amount} type="number" onChange={e => setEditForm({...editForm, total_amount: e.target.value})} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <Button onClick={handleEditSave} className="w-full bg-teal-500 hover:bg-teal-600 text-white mt-4">
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}