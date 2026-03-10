import { MapPin, Phone, Clock, ExternalLink } from "lucide-react";
import { LOCATIONS } from "@/data/siteData";

const LocationsSection = () => (
  <section id="locations" className="py-24">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center mb-16">
        <h2 className="font-heading text-4xl md:text-5xl font-bold uppercase text-foreground">
          Our Locations
        </h2>
        <p className="font-heading text-2xl text-primary italic font-normal mt-2">
          find us near you.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {LOCATIONS.map((loc) => (
          <div key={loc.id} className="bg-card rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-border">
            <h3 className="font-heading text-xl font-bold uppercase text-foreground mb-4">{loc.name}</h3>
            <div className="space-y-3 font-body text-sm text-muted-foreground">
              <div className="flex items-start gap-3 group">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <a
                  href={loc.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                  aria-label={`View ${loc.name} location on Google Maps`}
                >
                  <span>{loc.address}, {loc.city}, {loc.state} {loc.zip}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <span>{loc.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>{loc.hours}</span>
              </div>
            </div>
            <a
              href={loc.doordashUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wide rounded-full hover:opacity-90 transition-opacity"
            >
              Order on DoorDash <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LocationsSection;
