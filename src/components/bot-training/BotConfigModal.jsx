import React, { useState, useEffect } from 'react';
import { X, Plus, Check, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';

const PRESET_FIELDS = [
  { id: 'customer_name', label: 'Customer Name' },
  { id: 'phone_number', label: 'Phone Number' },
  { id: 'delivery_address', label: 'Delivery Address' },
  { id: 'product_quantity', label: 'Product Quantity' },
  { id: 'size_color', label: 'Size / Color Variant' },
  { id: 'email_address', label: 'Email Address' },
  { id: 'payment_method', label: 'Payment Method' },
  { id: 'city_postal', label: 'City & Postal Code' },
  { id: 'delivery_note', label: 'Delivery Note / Instructions' },
];

export default function BotConfigModal({ isOpen, onClose, configForm, onSave }) {
  const [form, setForm] = useState({
    support_contact: '',
    system_prompt: '',
  });

  const [selectedFields, setSelectedFields] = useState([]);
  const [customFieldName, setCustomFieldName] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

// সম্পূর্ণ ব্ল্যাঙ্ক ডেলিভারি রুল স্টেট
const [deliveryRules, setDeliveryRules] = useState([]);
const [zoneInput, setZoneInput] = useState('');
const [feeInput, setFeeInput] = useState('');
const [paymentTypeInput, setPaymentTypeInput] = useState('Cash on Delivery');
const [isAddingDelivery, setIsAddingDelivery] = useState(false);


  // Load existing configuration and fields from database when modal opens
  useEffect(() => {
    if (isOpen && configForm) {
      setForm({
        support_contact: configForm.support_contact || '',
        system_prompt: configForm.system_prompt || '',
      });

      if (Array.isArray(configForm.order_capture_fields) && configForm.order_capture_fields.length > 0) {
        setSelectedFields(configForm.order_capture_fields);
      } else {
        setSelectedFields([
          { id: 'customer_name', label: 'Customer Name' },
          { id: 'phone_number', label: 'Phone Number' },
          { id: 'delivery_address', label: 'Delivery Address' },
          { id: 'product_quantity', label: 'Product Quantity' },
        ]);
      }

      if (Array.isArray(configForm.delivery_rules)) {
        setDeliveryRules(configForm.delivery_rules);
      }
    }
  }, [isOpen, configForm]);

  if (!isOpen) return null;

  // Toggle preset fields
  const togglePresetField = (preset) => {
    const exists = selectedFields.some((f) => f.id === preset.id);
    if (exists) {
      setSelectedFields(selectedFields.filter((f) => f.id !== preset.id));
    } else {
      setSelectedFields([...selectedFields, preset]);
    }
  };

  // Add custom field dynamically (+ Add your own way)
  const handleAddCustomField = () => {
    const trimmed = customFieldName.trim();
    if (!trimmed) return;

    // Generate a safe ID for the custom field
    const generatedId = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newField = {
      id: generatedId,
      label: trimmed,
      isCustom: true,
    };

    // Prevent duplicates
    if (!selectedFields.some((f) => f.id === generatedId)) {
      setSelectedFields([...selectedFields, newField]);
    }

    setCustomFieldName('');
    setIsAddingCustom(false);
  };

  // Remove a custom field
  const handleRemoveField = (fieldId) => {
    setSelectedFields(selectedFields.filter((f) => f.id !== fieldId));
  };
 const handleAddDeliveryRule = () => {
  if (!zoneInput.trim() || feeInput === '') return;
  setDeliveryRules([
    ...deliveryRules,
    {
      id: Date.now().toString(),
      zone: zoneInput.trim(),
      fee: parseFloat(feeInput) || 0,
      payment_type: paymentTypeInput,
    },
  ]);
  setZoneInput('');
  setFeeInput('');
  setIsAddingDelivery(false);
};

const handleRemoveDeliveryRule = (ruleId) => {
  setDeliveryRules(deliveryRules.filter((r) => r.id !== ruleId));
};
  // Handle final submission to parent component
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      support_contact: form.support_contact,
      system_prompt: form.system_prompt,
      order_capture_fields: selectedFields,
      delivery_rules: deliveryRules,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-teal-400">✨</span>
            <h2 className="text-lg font-semibold">AI Bot Configuration</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Human Support / Escalation Contact */}
        <div>
          <label className="text-xs text-slate-300 font-medium">
            Human Support & Escalation Contact
          </label>
          <input
            type="text"
            placeholder="e.g. Email, phone number, helpdesk link, or social handle..."
            value={form.support_contact}
            onChange={(e) => setForm({ ...form, support_contact: e.target.value })}
            className="w-full mt-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            When the AI cannot answer an unknown query after 1-2 attempts, it will provide this contact directly to the customer.
          </p>
        </div>

          {/* System Prompt */}
          <div>
            <label className="text-xs text-slate-400">System Prompt</label>
            <textarea
              rows={3}
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="Use this product inventory dataset as the primary ground-truth..."
              className="w-full mt-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
            />
          </div>
          
          {/* AI Order Capture Fields */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium text-slate-200">AI Order Capture Fields</h3>
              <p className="text-xs text-slate-400">Select the information AI must collect before creating an order:</p>
            </div>
            {/* Chips Container */}
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Preset Chips */}
              {PRESET_FIELDS.map((field) => {
                const isSelected = selectedFields.some((f) => f.id === field.id);
                return (
                  <button
                    type="button"
                    key={field.id}
                    onClick={() => togglePresetField(field)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    {field.label}
                  </button>
                );
              })}

              {/* Custom Added Chips */}
              {selectedFields
                .filter((f) => !PRESET_FIELDS.some((p) => p.id === f.id))
                .map((customField) => (
                  <div
                    key={customField.id}
                    className="flex items-center gap-1.5 rounded-full bg-teal-500/20 border border-teal-500/40 px-3 py-1.5 text-xs font-medium text-teal-300"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{customField.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveField(customField.id)}
                      className="ml-1 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

              {/* + Add Your Own Way Input / Button */}
              {isAddingCustom ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Field name (e.g. Size)"
                    value={customFieldName}
                    onChange={(e) => setCustomFieldName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomField();
                      }
                    }}
                    className="rounded-full border border-teal-500 bg-slate-800 px-3 py-1 text-xs text-white focus:outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCustomField}
                    className="h-6 rounded-full px-2 text-xs bg-teal-600 hover:bg-teal-500"
                  >
                    Add
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-slate-600 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 hover:border-teal-400 hover:text-teal-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  + Add your own way
                </button>
              )}
            </div>

            {/* Live AI Schema Preview */}
            <div className="mt-3 rounded-md bg-slate-900 p-3 border border-slate-800/80 text-xs font-mono space-y-1">
              <div className="text-teal-400 font-semibold mb-1 flex items-center gap-1">
                ⚡ AI CHECKOUT SCHEMA PREVIEW:
              </div>
              {selectedFields.map((f) => (
                <div key={f.id} className="text-slate-300">
                  <span className="text-teal-300">{f.label}</span>: &lt;collected from customer&gt;
                </div>
              ))}
              <div className="text-amber-400 font-medium">Total Price: &lt;auto calculated&gt;</div>
            </div>
          </div>
{/* Dynamic Delivery Rules */}
<div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3 mt-4">
  <div className="flex items-center justify-between">
    <div>
      <h3 className="text-sm font-medium text-slate-200">Custom Delivery & Shipping Rules</h3>
      <p className="text-xs text-slate-400">Add shipping zones, fees, and payment rules for your store:</p>
    </div>
    {!isAddingDelivery && (
      <Button
        type="button"
        size="sm"
        onClick={() => setIsAddingDelivery(true)}
        className="h-7 text-xs bg-teal-600 hover:bg-teal-500"
      >
        + Add Rule
      </Button>
    )}
  </div>

  {/* Active Rules List */}
  <div className="space-y-2">
    {deliveryRules.map((rule) => (
      <div key={rule.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-xs">
        <div>
          <span className="font-semibold text-teal-300">{rule.zone}</span>
          <span className="text-slate-400 ml-2">({rule.payment_type})</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-amber-300">{rule.fee}</span>
          <button
            type="button"
            onClick={() => handleRemoveDeliveryRule(rule.id)}
            className="text-slate-500 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    ))}
  </div>

  {/* Input Form */}
  {isAddingDelivery && (
    <div className="grid grid-cols-[1fr_90px_1fr_auto] gap-2 bg-slate-900 p-2.5 rounded-lg border border-teal-500/30 items-center">
      <input
        type="text"
        placeholder="Zone Name"
        value={zoneInput}
        onChange={(e) => setZoneInput(e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 w-full"
      />
      <input
        type="number"
        placeholder="Fee"
        value={feeInput}
        onChange={(e) => setFeeInput(e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 w-full"
      />
      <select
        value={paymentTypeInput}
        onChange={(e) => setPaymentTypeInput(e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500 w-full"
      >
        <option value="Cash on Delivery">Cash on Delivery</option>
        <option value="Advance Delivery Fee">Advance Delivery Fee</option>
        <option value="Full Advance Payment">Full Advance Payment</option>
      </select>
      <div className="flex gap-1 items-center">
        <Button
          type="button"
          size="sm"
          onClick={handleAddDeliveryRule}
          className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-500 text-white font-medium"
        >
          Add
        </Button>
        <button
          type="button"
          onClick={() => setIsAddingDelivery(false)}
          className="text-slate-400 hover:text-white px-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )}
</div>
          {/* Modal Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-teal-600 hover:bg-teal-500 text-white font-medium">
              Save Configuration
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}