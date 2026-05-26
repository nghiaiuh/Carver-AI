import FeaturesSection from "./FeaturesSection";
import FinalCTA from "./FinalCTA";
import FlagshipSection from "./FlagshipSection";
import Footer from "./Footer";
import Hero from "./Hero";
import Navbar from "./Navbar";
import ProblemSection from "./ProblemSection";
import ProposalPreviewSection from "./ProposalPreviewSection";
import RealityCheckSection from "./RealityCheckSection";
import UsersSection from "./UsersSection";
import WorkflowSection from "./WorkflowSection";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F2E8] font-sans text-[#102A24]">
      <Navbar />
      <Hero />
      <ProblemSection />
      <WorkflowSection />
      <FeaturesSection />
      <UsersSection />
      <FlagshipSection />
      <RealityCheckSection />
      <ProposalPreviewSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
