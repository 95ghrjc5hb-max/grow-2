import React from "react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-300">
      {/* Back Button */}
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
        className="mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all cursor-pointer"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="w-4 h-4" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Effective & Last Updated: October 13, 2026 | GROW Next-Gen SaaS
        </p>
      </div>

      {/* Main Container */}
      <div className="space-y-6 text-sm leading-relaxed bg-[#0d111a] p-8 rounded-2xl border border-white/10 shadow-xl">
        {/* Intro */}
        <p>
          Welcome to <strong>GROW Next-Gen SaaS</strong> ("GROW", "Platform", "we", "us", or "our"). 
          GROW is an enterprise omnichannel AI communication, automation, and customer support platform owned 
          and legally operated by <strong>GROWCORE BOT</strong>, a registered entity in Bangladesh. 
          We are committed to protecting the privacy, personal data, and business records of our merchants, 
          their end-consumers, and visitors in full accordance with global data protection standards, 
          the <strong>Meta Platform Terms & Developer Policies</strong>, the <strong>WhatsApp Business Messaging Policy</strong>, 
          and the <strong>Shopify API License & Partner Agreement</strong>.
        </p>

        {/* 1. Legal Entity & Operating Information */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. Legal Entity & Operating Information</h2>
          <p className="mb-2">
            This platform, its databases, cloud integrations, and automation services are owned and legally operated by:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Legal Business Name:</strong> GROWCORE BOT</li>
            <li><strong>Business Category / Nature:</strong> Software & IT Services</li>
            <li><strong>Trade License Number:</strong> 20262603001162</li>
            <li><strong>Taxpayer Identification Number (TIN):</strong> 840088804536</li>
            <li><strong>Registered Address:</strong> Gajaria Khanpara, Pachrukhi, Araihazar, Narayanganj - 1460, Dhaka, Bangladesh</li>
            <li><strong>Official Website:</strong> <a href="https://www.growcorebot.com" className="text-teal-400 hover:text-cyan-300 underline">https://www.growcorebot.com</a></li>
            <li><strong>Support & Compliance Email:</strong> <a href="mailto:supportgrowapp@gmail.com" className="text-teal-400 hover:text-cyan-300 underline">supportgrowapp@gmail.com</a> / <a href="mailto:nazmul_i14@icloud.com" className="text-teal-400 hover:text-cyan-300 underline">nazmul_i14@icloud.com</a></li>
            <li><strong>Business Phone:</strong> +8801714376578</li>
          </ul>
        </div>

        {/* 2. Information We Collect */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>
          <p className="mb-2">
            To deliver automated messaging, multi-channel inbox sync, and e-commerce catalog integrations, we collect only necessary data:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>GROW Account Information:</strong> Name, verified business email, organization ID, encrypted login credentials, and subscription status.</li>
            <li><strong>Meta Platform Integration Data (Facebook Messenger & Instagram DM):</strong> Page Access Tokens, Page Scoped IDs (PSID), Instagram Scoped IDs (IGSID), chat transcripts, message metadata, timestamps, and delivery statuses.</li>
            <li><strong>WhatsApp Business Platform Data (Cloud API & Embedded Signup):</strong> WhatsApp Business Account ID (WABA ID), Phone Number ID, Display Phone Number, business profile data, and encrypted System User access tokens.</li>
            <li><strong>Shopify Store Integration Data:</strong> Store domain, offline access tokens, read-only catalog data (products, variants, inventory levels), and order numbers strictly required for automated order tracking lookups.</li>
            <li><strong>AI Training & Knowledge Base Data:</strong> FAQs, custom bot instructions, product knowledge, and conversation context provided to generate automated replies.</li>
          </ul>
        </div>

        {/* 3. How We Use and Process Information */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use and Process Data</h2>
          <p className="mb-2">We process data strictly to fulfill contracted SaaS operations:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>Executing real-time AI auto-responses and team inbox routing across WhatsApp, Messenger, and Instagram.</li>
            <li>Synchronizing customer product inquiries with real-time Shopify inventory and order records.</li>
            <li>Providing merchants with conversational volume metrics and resolution analytics.</li>
            <li>Ensuring system security, monitoring API reliability, and preventing abuse or spam.</li>
          </ul>
          <p className="mt-2 text-slate-300">
            <strong>AI Privacy Guarantee:</strong> We <strong>never</strong> sell your business data, nor do we use your proprietary customer communications to train public AI foundation models.
          </p>
        </div>

        {/* 4. Meta Platform & WhatsApp Developer Policy Compliance */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. Meta Platform & WhatsApp Compliance</h2>
          <p className="mb-2">In accordance with Meta Developer Policies and the WhatsApp Business Messaging Policy:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Customer Consent & Messaging Windows:</strong> GROW automates responses solely within the Meta 24-hour customer service window upon customer-initiated contact, or via pre-approved WhatsApp Business template notifications.</li>
            <li><strong>Token Security:</strong> All client tokens, System User secrets, and webhook secrets are stored with AES-256 encryption at rest and transmitted securely over TLS 1.3.</li>
            <li><strong>Tenant Isolation:</strong> Multi-tenant isolation guarantees that no organization can view, intercept, or access another business account's Meta communication streams.</li>
          </ul>
        </div>

        {/* 5. Shopify Merchant Compliance & Mandatory GDPR Webhooks */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Shopify Merchant & Mandatory GDPR Webhook Compliance</h2>
          <p className="mb-2">In compliance with the Shopify Partner Program Agreement and API License:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Least-Privilege Scopes:</strong> We request only the minimal API permissions needed for conversational assistance.</li>
            <li><strong><code>customers/data_request</code>:</strong> Upon receiving a customer data request forwarded by Shopify, GROW provides an export of associated chat records within 30 days.</li>
            <li><strong><code>customers/redact</code>:</strong> Upon receiving a customer erasure request, all personal identifiers linked to that consumer are permanently purged within 30 days.</li>
            <li><strong><code>shop/redact</code>:</strong> When a merchant uninstalls the GROW app, all store data, cached catalog details, and access tokens are permanently deleted from our active databases within 48 hours.</li>
          </ul>
        </div>

        {/* 6. Data Security & Multi-Tenant Storage */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Data Security & Storage</h2>
          <p>
            We implement industry-standard security safeguards including database Row-Level Security (RLS), 
            AES-256 encryption at rest, TLS 1.3 encryption in transit, automated vulnerability patching, and 
            isolated cloud container environments to prevent unauthorized data exposure or breaches.
          </p>
        </div>

        {/* 7. User Data Deletion Instructions (Meta & Direct) */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. User Data Deletion Instructions (Meta Platform & Direct)</h2>
          <p className="mb-2">
            In compliance with Meta Platform Data Deletion requirements, users and merchants have complete control to delete their stored data:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>
              <strong>Direct Email Request:</strong> Send an email to{" "}
              <a href="mailto:supportgrowapp@gmail.com" className="text-teal-400 hover:text-cyan-300 underline">
                supportgrowapp@gmail.com
              </a>{" "}
              with the subject line <em>"Data Deletion Request"</em>. Mention your registered email or Meta Page/WABA ID. Our team will permanently delete your records and issue a confirmation tracking code within 7 business days.
            </li>
            <li>
              <strong>Via Facebook Settings:</strong> You can disconnect GROW at any time by navigating to Facebook 
              <strong> Settings & Privacy &gt; Settings &gt; Business Integrations</strong>, selecting <strong>GROW Next-Gen SaaS</strong>, 
              and clicking <strong>Remove</strong>. Our automated deauthorization callback will immediately revoke active tokens and uncouple your account.
            </li>
          </ul>
        </div>

        {/* 8. Contact Our Data Protection Officer */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Legal & Compliance Contact</h2>
          <p className="mb-2">
            If you have questions regarding this Privacy Policy or regulatory compliance:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Operating Entity:</strong> GROWCORE BOT</li>
            <li><strong>Representative / Officer:</strong> Nazmul Bhuiyan Zayn</li>
            <li><strong>Registered Address:</strong> Gajaria Khanpara, Pachrukhi, Araihazar, Narayanganj - 1460, Dhaka, Bangladesh</li>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:supportgrowapp@gmail.com" className="text-teal-400 hover:text-cyan-300 underline">
                supportgrowapp@gmail.com
              </a>{" "}
              /{" "}
              <a href="mailto:nazmul_i14@icloud.com" className="text-teal-400 hover:text-cyan-300 underline">
                nazmul_i14@icloud.com
              </a>
            </li>
            <li><strong>Phone:</strong> +8801714376578</li>
          </ul>
        </div>
      </div>
    </div>
  );
}