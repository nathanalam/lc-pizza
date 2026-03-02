import { useState } from "react";
import { submitPartnershipForm, type PartnershipFormData } from "@/data/siteData";
import { toast } from "sonner";

const PartnershipSection = () => {
  const [form, setForm] = useState<PartnershipFormData>({
    schoolName: "",
    contactName: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.schoolName.trim() || !form.contactName.trim() || !form.email.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await submitPartnershipForm(form);
      toast.success("Thank you! We'll be in touch soon.");
      setForm({ schoolName: "", contactName: "", email: "", phone: "", message: "" });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground font-body text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition";

  return (
    <section id="partnerships" className="py-24 bg-card">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-heading text-4xl md:text-5xl font-bold uppercase text-foreground">
            School Partnerships
          </h2>
          <p className="font-heading text-2xl text-primary italic font-normal mt-2">
            let's work together.
          </p>
          <p className="font-body text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
            We love partnering with local schools for fundraising events, spirit nights, and more. Fill out the form below and we'll reach out to discuss how we can support your community.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <input
              type="text"
              placeholder="School Name *"
              value={form.schoolName}
              onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
              className={inputClass}
              maxLength={100}
              required
            />
            <input
              type="text"
              placeholder="Contact Name *"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className={inputClass}
              maxLength={100}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <input
              type="email"
              placeholder="Email *"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              maxLength={255}
              required
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
              maxLength={20}
            />
          </div>
          <textarea
            placeholder="Tell us about the partnership you have in mind..."
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={4}
            className={inputClass + " resize-none"}
            maxLength={1000}
          />
          <div className="text-center">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wide rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Submit Interest"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default PartnershipSection;
