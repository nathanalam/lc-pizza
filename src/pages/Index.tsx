import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import LocationsSection from "@/components/LocationsSection";
import ApplySection from "@/components/ApplySection";
import PartnershipSection from "@/components/PartnershipSection";
import Footer from "@/components/Footer";

const Index = () => (
  <>
    <Navbar />
    <main>
      <HeroSection />
      <AboutSection />
      <LocationsSection />
      <ApplySection />
      <PartnershipSection />
    </main>
    <Footer />
  </>
);

export default Index;
