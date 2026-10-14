import React from "react";
import { useNavigate } from "react-router-dom";

export default function Terms() {
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500">
          Effective & Last Updated: October 13, 2026 | GROW Next-Gen SaaS
        </p>
      </div>

      {/* Main Container */}
      <div className="space-y-6 text-sm leading-relaxed bg-[#0d111a] p-8 rounded-2xl border border-white/10 shadow-xl">
        {/* Intro */}
        <p>
          Welcome to <strong>GROW Next-Gen SaaS</strong> ("GROW", "Platform", "Service"). 
          These Terms of Service constitute a legally binding agreement between you (the "Merchant", "Customer", or "User") 
          and <strong>GROWCORE BOT</strong> ("Company", "we", "us", or "our"), governing your access to and usage of{" "}
          <a href="https://www.growcorebot.com" className="text-teal-400 hover:text-cyan-300 underline">
            https://www.growcorebot.com
          </a>{" "}
          and all integrated third-party communication channels.
        </p>

        {/* 1. Operating Legal Entity & Scope */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. Operating Entity & Scope of Service</h2>
          <p className="mb-2">
            GROW is a proprietary multi-channel SaaS automation platform owned and legally operated by:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Legal Entity Name:</strong> GROWCORE BOT</li>
            <li><strong>Business Category:</strong> Software & IT Services</li>
            <li><strong>Trade License Number:</strong> 20262603001162</li>
            <li><strong>Tax Identification Number (TIN):</strong> 840088804536</li>
            <li><strong>Registered Address:</strong> Gajaria Khanpara, Pachrukhi, Araihazar, Narayanganj - 1460, Dhaka, Bangladesh</li>
            <li><strong>Service Scope:</strong> Providing AI-driven conversational management, unified multi-channel messaging inboxes, automated catalog retrieval, and webhook integrations across Meta platforms and Shopify.</li>
          </ul>
        </div>

        {/* 2. Account Eligibility & Acceptable Use */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Account Registration & Lawful Usage</h2>
          <p className="mb-2">By accessing or using the platform, you represent and warrant that:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>You are at least 18 years old and authorized to represent your business entity.</li>
            <li>You will maintain the security and confidentiality of your administrative login credentials.</li>
            <li>You will not use GROW to transmit spam, unsolicited commercial broadcasts, harassing messages, malicious code, or deceptive marketing violating telecommunication laws or third-party platform policies.</li>
          </ul>
        </div>

        {/* 3. Meta Platform & WhatsApp API Compliance */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. Meta Platform & WhatsApp Policy Compliance</h2>
          <p className="mb-2">When connecting Meta-powered channels (Facebook Messenger, Instagram DM, or WhatsApp Business Platform via Embedded Signup):</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>You explicitly agree to comply with the <strong>Meta Commercial Terms</strong>, <strong>Meta Developer Policies</strong>, and the <strong>WhatsApp Business Messaging Policy</strong>.</li>
            <li>You warrant that you have secured all legally required subscriber opt-ins and consents before initiating outbound notifications via WhatsApp message templates.</li>
            <li>GROWCORE BOT reserves the right to immediately suspend or restrict API connector tokens if Meta flags or restricts your WhatsApp Business Account (WABA) or Facebook Page for policy violations.</li>
          </ul>
        </div>

        {/* 4. Shopify Merchant Integration & API Terms */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. Shopify Integration & Merchant Obligations</h2>
          <p className="mb-2">When connecting your Shopify e-commerce store with GROW:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>You authorize GROW to securely access read-only product catalog details and order statuses strictly to answer real-time conversational queries from your customers.</li>
            <li>You acknowledge that GROW enforces mandatory Shopify GDPR webhooks (<code>customers/data_request</code>, <code>customers/redact</code>, and <code>shop/redact</code>).</li>
            <li>Upon uninstallation of the GROW app from your Shopify store admin, all stored tokens and cached store records are permanently purged within 48 hours.</li>
          </ul>
        </div>

        {/* 5. AI Capabilities & Output Disclaimer */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. AI Automation & Generative Output Disclaimer</h2>
          <p className="mb-2">
            GROW integrates high-performance artificial intelligence models to deliver automated conversation responses:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>Automated replies are generated based on merchant-provided bot instructions, uploaded FAQs, and synchronized product catalogs.</li>
            <li>Merchants maintain full editorial authority over fallback rules, safety guardrails, and human agent handoff configurations.</li>
            <li>GROWCORE BOT is not liable for unintended pricing quotes or commitments generated due to inaccurate training prompts or outdated catalog data configured by the merchant.</li>
          </ul>
        </div>

        {/* 6. Fees, Billing & Service Modifications */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Subscription Billing & Fees</h2>
          <p className="mb-2">
            Platform features are billed on a recurring monthly or annual subscription basis. Direct third-party usage costs 
            (such as Meta WhatsApp conversation fees or custom telecom charges) are billed directly through your Meta Business Manager 
            account payment method unless otherwise specified.
          </p>
        </div>

        {/* 7. Intellectual Property & Termination */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Intellectual Property & Account Termination</h2>
          <p className="mb-2">
            The GROW platform, user interface designs, custom logic, and branding are the exclusive intellectual property of <strong>GROWCORE BOT</strong>. 
            You retain complete ownership of your customer conversations and proprietary business assets. You may disconnect integrations or close your account 
            at any time via platform settings.
          </p>
        </div>

        {/* 8. Limitation of Liability */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Limitation of Liability & Indemnification</h2>
          <p>
            To the maximum extent permitted under Bangladesh law, GROWCORE BOT shall not be held liable for any indirect, consequential, or operational 
            damages arising from platform downtime, network carrier outages, or policy enforcement actions enacted by third-party providers (such as Meta or Shopify). 
            You agree to defend and hold harmless GROWCORE BOT against any third-party claims arising from your breach of platform terms.
          </p>
        </div>

        {/* 9. Contact & Legal Support */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact & Legal Entity Information</h2>
          <p className="mb-2">
            For legal inquiries, terms compliance, or technical support, please contact our operating entity:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>Operating Entity:</strong> GROWCORE BOT</li>
            <li><strong>Authorized Officer:</strong> Nazmul Bhuiyan Zayn</li>
            <li><strong>Official Address:</strong> Gajaria Khanpara, Pachrukhi, Araihazar, Narayanganj - 1460, Dhaka, Bangladesh</li>
            <li>
              <strong>Support Email:</strong>{" "}
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