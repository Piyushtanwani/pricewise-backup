import { Request, Response } from 'express';

export const getPriceIntelligence = async (req: Request, res: Response): Promise<void> => {
  try {
    // Mock price intelligence data based on the UI requirements
    res.json({
      priceHistoryData: [
        { date: "Jul 18", price: 34990, avg: 33200 },
        { date: "Aug 1", price: 33500, avg: 33200 },
        { date: "Aug 15", price: 32000, avg: 33000 },
        { date: "Sep 1", price: 31500, avg: 32500 },
        { date: "Sep 15", price: 32500, avg: 32200 },
        { date: "Oct 1", price: 30999, avg: 32000 },
        { date: "Oct 15", price: 30500, avg: 31500 },
        { date: "Nov 1", price: 29999, avg: 31000 },
        { date: "Nov 15", price: 29999, avg: 30800 },
        { date: "Dec 1", price: 29999, avg: 30600 },
      ],
      predictionData: [
        { date: "Dec 1", price: 29999, predicted: 29999, upper: 29999, lower: 29999 },
        { date: "Dec 15", price: null, predicted: 29200, upper: 30500, lower: 28000 },
        { date: "Jan 1", price: null, predicted: 28500, upper: 31000, lower: 27000 },
        { date: "Jan 15", price: null, predicted: 28000, upper: 31500, lower: 26500 },
      ]
    });
  } catch (error) {
    console.error('Error fetching price intelligence:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAIAssistantChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;
    
    // Mock AI response
    res.json({
      role: "assistant",
      content: "Based on current pricing and historical trends, here are my top picks under ₹1,00,000:",
      products: [],
      insights: [
        { label: "Best Overall", value: "MacBook Air M3 — exceptional battery, build, and performance" },
        { label: "Price Trend", value: "Currently 13% below MRP — historically a good entry point" },
        { label: "Prediction", value: "Likely to stay at this price through January before rising slightly" },
        { label: "Verdict", value: "Buy now. Current price is near its 3-month low." },
      ]
    });
  } catch (error) {
    console.error('Error with AI assistant:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
