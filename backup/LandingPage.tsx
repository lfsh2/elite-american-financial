import React from 'react';
import { useLocation } from 'wouter';

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 text-white">
      {/* Hero Section */}
      <div className="container mx-auto pt-20 pb-16 px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-6">
          Welcome to Textflow
        </h1>
        <p className="text-xl md:text-2xl max-w-3xl mx-auto mb-10 text-gray-300">
          The modern communication platform for businesses. 
          Simplify your SMS, voice, and email messaging with our powerful all-in-one solution.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button 
            onClick={() => setLocation('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition duration-300"
          >
            Login
          </button>
          <button 
            onClick={() => setLocation('/register')}
            className="bg-transparent hover:bg-white/10 text-white font-bold py-3 px-8 rounded-md border border-white/30 transition duration-300"
          >
            Register
          </button>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Communication Tools</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Everything you need to engage with your customers on their preferred channels.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            title="SMS Messaging"
            description="Send and receive text messages, build SMS campaigns, and automate your messaging workflows."
            icon="📱"
          />
          <FeatureCard 
            title="Voice Calling"
            description="Make and receive calls, set up IVR systems, and create voice broadcasts for your business."
            icon="🔊"
          />
          <FeatureCard 
            title="Email Integration"
            description="Connect with your customers through personalized email campaigns and automations."
            icon="✉️"
          />
        </div>
      </div>

      {/* Pricing Section */}
      <div className="container mx-auto py-16 px-4 sm:px-6 lg:px-8 bg-black/20 rounded-2xl my-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Pay only for what you use with our credit-based pricing model.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <PricingCard 
            title="Small Business"
            credits={1000}
            price={10}
            features={[
              "SMS & MMS Messaging",
              "Voice Calling",
              "Basic Analytics",
              "Email Support"
            ]}
          />
          <PricingCard 
            title="Business Pro"
            credits={10000}
            price={90}
            features={[
              "Everything in Small Business",
              "Advanced Analytics",
              "API Access",
              "Priority Support"
            ]}
            highlighted={true}
          />
          <PricingCard 
            title="Enterprise"
            credits={100000}
            price={800}
            features={[
              "Everything in Business Pro",
              "Dedicated Phone Numbers",
              "Custom Integrations",
              "Account Manager"
            ]}
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-gray-400">© 2025 Textflow. All rights reserved.</p>
          </div>
          <div className="text-gray-400">
            <p>Powered by Softlink IQ</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description, icon }: { title: string, description: string, icon: string }) {
  return (
    <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm hover:bg-white/15 transition duration-300">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </div>
  );
}

function PricingCard({ 
  title, 
  credits, 
  price, 
  features, 
  highlighted = false 
}: { 
  title: string, 
  credits: number, 
  price: number, 
  features: string[], 
  highlighted?: boolean 
}) {
  const [, setLocation] = useLocation();
  
  return (
    <div className={`rounded-xl p-6 backdrop-blur-sm transition duration-300 ${
      highlighted 
        ? 'bg-blue-600 hover:bg-blue-700 transform hover:-translate-y-1' 
        : 'bg-white/10 hover:bg-white/15'
    }`}>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <div className="mb-4">
        <span className="text-3xl font-bold">${price}</span>
        <span className="text-gray-300"> / {credits.toLocaleString()} credits</span>
      </div>
      <ul className="mb-6 space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center">
            <svg className="w-4 h-4 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <button 
        onClick={() => setLocation('/register')}
        className={`w-full py-2 px-4 rounded-md font-medium transition duration-300 ${
          highlighted 
            ? 'bg-white text-blue-700 hover:bg-gray-100' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        Get Started
      </button>
    </div>
  );
}