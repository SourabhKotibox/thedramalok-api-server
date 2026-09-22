import mongoose from 'mongoose';
import { StoryModel } from './src/models/Story';
import { GenreModel } from './src/models/Genre';
import { LanguageModel } from './src/models/Language';
import { CategoryModel } from './src/models/Category';

async function seedStories() {
  await mongoose.connect('mongodb://localhost:27017/triple-mindes');
  console.log('Connected to MongoDB');

  // Fetch reference metadata
  const genres = await GenreModel.find().lean();
  const languages = await LanguageModel.find().lean();
  const categories = await CategoryModel.find().lean();

  const genreMap = new Map(genres.map(g => [g.name.toLowerCase(), g._id]));
  const langMap = new Map(languages.map(l => [l.name.toLowerCase(), l._id]));
  const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c._id]));

  const hindiLang = langMap.get('hindi') || languages[0]?._id;
  const englishLang = langMap.get('english') || languages[1]?._id;
  const tamilLang = langMap.get('tamil') || languages[2]?._id;

  const horrorGenre = genreMap.get('horror') || genres[0]?._id;
  const romanceGenre = genreMap.get('romance') || genres[0]?._id;
  const thrillerGenre = genreMap.get('thriller') || genres[0]?._id;
  const crimeGenre = genreMap.get('crime') || genres[0]?._id;
  const dramaGenre = genreMap.get('drama') || genres[0]?._id;
  const fantasyGenre = genreMap.get('fantasy') || genres[0]?._id;
  const mysteryGenre = genreMap.get('mystery') || genres[0]?._id;

  const sampleStories = [
    {
      title: "Ek Thi Dayan - Haveli Ka Raaz",
      description: "A chilling tale of an abandoned haveli in the dense forests of Himachal. Raghav, an investigative journalist, decides to stay overnight to uncover the century-old myth of the wandering spirit.",
      shortDescription: "A chilling spine-tingling audio drama set in the haunted hills.",
      thumbnail: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=600&h=900&fit=crop&q=80",
      author: "Vikramaditya Sharma",
      narrator: "Kabir Bedi Style Voice",
      category: "Horror Drama",
      tags: ["horror", "mystery", "ghost", "thriller"],
      languages: [hindiLang],
      genres: [horrorGenre, mysteryGenre],
      categories: [catMap.get('horror drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      duration: 42,
      views: 14200,
      likes: 3890,
      shares: 650,
      featured: true,
      trending: true,
      isNewContent: true,
      isExclusive: true,
      planRequired: "free",
      ageRating: 16,
      rating: "A",
      slug: "ek-thi-dayan-haveli-ka-raaz",
    },
    {
      title: "Pyaar Ya Dhokha: Billionaire's Secret",
      description: "Aarav Kapoor is the heir to a multi-billion empire, living a secret double life. When he meets Ananya, an honest cafe artist, fate weaves a passionate yet complicated web of romance and hidden betrayals.",
      shortDescription: "A gripping romantic drama filled with secrets, passion, and intense emotions.",
      thumbnail: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&h=900&fit=crop&q=80",
      author: "Simran Oberoi",
      narrator: "Riya Sen",
      category: "Romance Drama",
      tags: ["romance", "billionaire", "love", "drama"],
      languages: [hindiLang, englishLang],
      genres: [romanceGenre, dramaGenre],
      categories: [catMap.get('romance drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      duration: 35,
      views: 28900,
      likes: 7420,
      shares: 1200,
      featured: true,
      trending: true,
      isNewContent: true,
      isExclusive: false,
      planRequired: "free",
      ageRating: 13,
      rating: "U/A",
      slug: "pyaar-ya-dhokha-billionaires-secret",
    },
    {
      title: "The Midnight Murder at Room 302",
      description: "When a prominent industrialist is found murdered inside a locked hotel suite with no windows and zero signs of forced entry, Detective Arjun Rawat is called to solve the impossible crime before sunrise.",
      shortDescription: "An edge-of-the-seat locked-room murder mystery podcast thriller.",
      thumbnail: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&h=900&fit=crop&q=80",
      author: "Aditya Roy",
      narrator: "Sameer Malhotra",
      category: "Crime Drama",
      tags: ["crime", "detective", "murder", "thriller"],
      languages: [hindiLang, englishLang],
      genres: [crimeGenre, thrillerGenre, mysteryGenre],
      categories: [catMap.get('crime drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      duration: 48,
      views: 19800,
      likes: 5120,
      shares: 890,
      featured: false,
      trending: true,
      isNewContent: false,
      isExclusive: true,
      planRequired: "premium",
      ageRating: 18,
      rating: "A",
      slug: "the-midnight-murder-at-room-302",
    },
    {
      title: "Shadows of the Underground Mafia",
      description: "Step into the gritty underbelly of Mumbai in the 90s, where gang wars, undercover cops, and high-stakes heists determined who ruled the port city.",
      shortDescription: "A realistic and raw crime audio story exploring the mafia empires.",
      thumbnail: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&h=900&fit=crop&q=80",
      author: "Devendra Patil",
      narrator: "Karan Johar",
      category: "Thriller Drama",
      tags: ["mafia", "gangster", "thriller", "action"],
      languages: [hindiLang],
      genres: [crimeGenre, thrillerGenre],
      categories: [catMap.get('thriller drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      duration: 52,
      views: 31200,
      likes: 9200,
      shares: 1450,
      featured: true,
      trending: false,
      isNewContent: true,
      isExclusive: true,
      planRequired: "premium",
      ageRating: 18,
      rating: "A",
      slug: "shadows-of-the-underground-mafia",
    },
    {
      title: "Kashmiri Kahani: Lost in Chinar",
      description: "A heartwarming historical family drama spanning two generations across the serene valleys of Srinagar and the vibrant gullies of Old Delhi.",
      shortDescription: "A soulful tale of love, heritage, and timeless relationships.",
      thumbnail: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=900&fit=crop&q=80",
      author: "Farida Mir",
      narrator: "Zainab Sheikh",
      category: "Family Drama",
      tags: ["kashmir", "family", "culture", "drama"],
      languages: [hindiLang],
      genres: [dramaGenre],
      categories: [catMap.get('family drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      duration: 28,
      views: 8900,
      likes: 2150,
      shares: 340,
      featured: false,
      trending: false,
      isNewContent: true,
      isExclusive: false,
      planRequired: "free",
      ageRating: 0,
      rating: "U",
      slug: "kashmiri-kahani-lost-in-chinar",
    },
    {
      title: "Yoddha: Rise of the Immortal Warrior",
      description: "Ancient Vedic myths merge with futuristic science fiction in this epic saga of an immortal warrior destined to protect the sacred cosmic gates.",
      shortDescription: "An epic mytho-fiction sci-fi audio series with immersive surround sound.",
      thumbnail: "https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=600&h=900&fit=crop&q=80",
      bannerImage: "https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=1200&h=600&fit=crop&q=80",
      coverImage: "https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=600&h=900&fit=crop&q=80",
      author: "Acharya Somesh",
      narrator: "Rohan Shastri",
      category: "Historical Drama",
      tags: ["mythology", "action", "fantasy", "epic"],
      languages: [hindiLang, tamilLang],
      genres: [fantasyGenre, thrillerGenre],
      categories: [catMap.get('historical drama') || categories[0]?._id],
      status: "published",
      processingStatus: "ready",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
      duration: 60,
      views: 45000,
      likes: 12800,
      shares: 3100,
      featured: true,
      trending: true,
      isNewContent: false,
      isExclusive: true,
      planRequired: "premium",
      ageRating: 13,
      rating: "U/A",
      slug: "yoddha-rise-of-the-immortal-warrior",
    }
  ];

  await StoryModel.deleteMany({});
  const created = await StoryModel.insertMany(sampleStories);
  console.log(`Successfully seeded ${created.length} published stories!`);

  await mongoose.disconnect();
}

seedStories().catch(console.error);
