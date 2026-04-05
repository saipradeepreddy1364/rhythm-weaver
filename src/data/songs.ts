export interface Song {
  id: string;
  title: string;
  artist: string;
  language: "Hindi" | "Telugu";
  year: number;
  genre: string;
  duration: number;
  albumArt: string;
  musicDirector: string;
  actor: string;
}

const hindiSingers = ["Arijit Singh", "Shreya Ghoshal", "Sonu Nigam", "Lata Mangeshkar", "Kumar Sanu", "Udit Narayan", "Alka Yagnik", "Kishore Kumar", "Neha Kakkar", "Atif Aslam", "Jubin Nautiyal", "B Praak", "Darshan Raval", "Mohit Chauhan", "KK", "Sunidhi Chauhan", "Rahat Fateh Ali Khan", "Mika Singh", "Armaan Malik", "Tulsi Kumar"];
const teluguSingers = ["SP Balasubrahmanyam", "S Janaki", "Shreya Ghoshal", "Sid Sriram", "Anurag Kulkarni", "Armaan Malik", "Haricharan", "Chinmayi", "Sunitha", "Chitra", "Mangli", "Rahul Sipligunj", "Shankar Mahadevan", "Karthik", "Vijay Prakash", "Andrea Jeremiah", "Mohana Bhogaraju", "Sri Krishna", "Sagar", "Nutana Mohan"];
const hindiActors = ["Shah Rukh Khan", "Salman Khan", "Aamir Khan", "Ranbir Kapoor", "Ranveer Singh", "Hrithik Roshan", "Akshay Kumar", "Varun Dhawan", "Kartik Aaryan", "Vicky Kaushal", "Deepika Padukone", "Alia Bhatt", "Priyanka Chopra", "Katrina Kaif", "Anushka Sharma"];
const teluguActors = ["Chiranjeevi", "Mahesh Babu", "Prabhas", "Allu Arjun", "Ram Charan", "Jr NTR", "Vijay Deverakonda", "Nani", "Ravi Teja", "Pawan Kalyan", "Samantha", "Rashmika Mandanna", "Pooja Hegde", "Anushka Shetty", "Kajal Aggarwal"];
const hindiMDs = ["A.R. Rahman", "Pritam", "Vishal-Shekhar", "Amit Trivedi", "Sachin-Jigar", "Tanishk Bagchi", "Mithoon", "Shankar-Ehsaan-Loy", "Salim-Sulaiman", "Himesh Reshammiya"];
const teluguMDs = ["S.S. Thaman", "Devi Sri Prasad", "Anirudh Ravichander", "Mickey J Meyer", "Mani Sharma", "M.M. Keeravani", "Sai Abhyankkar", "Rockstar Devi", "Anup Rubens", "Harris Jayaraj"];
const genres = ["Romantic", "Mass", "Melody", "Sad", "Dance", "Devotional", "Folk", "Classical", "Pop", "Rock"];

const hindiTitles = [
  "Tum Hi Ho", "Channa Mereya", "Kal Ho Naa Ho", "Tujhe Dekha Toh", "Chaiyya Chaiyya",
  "Dil Se Re", "Kabhi Khushi Kabhie Gham", "Tera Ban Jaunga", "Raataan Lambiyan", "Kesariya",
  "Apna Bana Le", "Tere Vaaste", "Phir Aur Kya Chahiye", "Jhoome Jo Pathaan", "Besharam Rang",
  "Gerua", "Agar Tum Saath Ho", "Ae Dil Hai Mushkil", "Ilahi", "Matargashti",
  "Badtameez Dil", "Gallan Goodiyan", "London Thumakda", "Kar Gayi Chull", "Kala Chashma",
  "Aashiqui Mein Teri", "Dil Diyan Gallan", "Tera Yaar Hoon Main", "Zaalima", "Hawayein",
  "Bekhayali", "Arijit Ki Mehfil", "Mann Mera", "Piya Basanti", "Suraj Hua Maddham",
  "Yeh Jawaani Hai Deewani", "Baarish", "Soch Na Sake", "Bulleya", "Deva Deva",
  "Namo Namo", "Maan Meri Jaan", "O Meri Laila", "Sanam Re", "Humdard",
  "Aaj Se Teri", "Suno Na Sangemarmar", "Zaroorat", "Sun Raha Hai Na Tu", "Pehla Nasha",
  "Rang De Tu Mohe", "Janam Janam", "Tere Naina", "Pani Da Rang", "Ishq Wala Love",
  "Tumse Milke Dilka", "Dil Ko Karaar Aaya", "Shayad", "Ghungroo", "War Ka Song",
  "Duniya", "Photo", "Vaaste", "Lut Gaye", "Paani Paani", "Raanjhanaa", "Masakali",
  "Tum Jo Aaye", "Tera Fitoor", "Tu Jhoothi Main Makkaar", "Bade Miyan Chote Miyan",
  "Dunki Theme", "Jawan Anthem", "Animal Ka Title", "Fighter Ki Udaan", "Rocky Aur Rani",
  "Brahmastra Ka Dil", "Pathaan Ki Dhadkan", "Bhool Bhulaiyaa Returns", "Stree Ka Raaz",
  "OMG Ka Jaadu", "Gadar Ka Dard", "Pushpa Hindi Dhamaka", "KGF Ka Storm", "Baahubali Calling",
  "RRR Ka Josh", "Dangal Ka Dum", "PK Ki Dhun", "3 Idiots Melody", "Lagaan Ka Sapna"
];

const teluguTitles = [
  "Oo Antava", "Samajavaragamana", "Buttabomma", "Inkem Inkem", "Butta Bomma",
  "Srivalli", "Naatu Naatu", "Ramuloo Ramulaa", "Bala Tripuramani", "Choosi Chudangane",
  "Nee Kannu Neeli Samudram", "Ye Nimishamlo", "Undiporaadhey", "Vachinde", "Ekkadiki",
  "Saami Saami", "Jai Lava Kusa Title", "Yevadu Theme", "Khaleja Anthem", "Simhadri Beat",
  "Baahubali Sivuni", "Magadheera Dheera", "Eega Buzz", "Rangasthalam Bell", "Arjun Reddy Breakup",
  "Geetha Govindam Love", "Dear Comrade Melody", "Mahanati Grace", "Jersey Anthem", "Ala Vaikunthapurramloo",
  "Pushpa Rise", "RRR Komuram", "Acharya Chant", "Waltair Veerayya", "Veera Simha Reddy",
  "Kushi Melody", "Hi Nanna Lullaby", "Salaar Thunder", "Guntur Kaaram", "Tillu Square",
  "Devara Storm", "Kalki Anthem", "Game Changer Beat", "Lucky Bhaskar", "Pushpa 2 Rise",
  "Akhanda Roar", "Bheemla Nayak", "Sarkaru Vaari Paata", "Vakeel Saab", "Gabbar Singh",
  "Attarintiki Daredi", "S/O Satyamurthy", "Julayi", "Dookudu", "Pokiri",
  "Jalsa Beat", "Murari Melody", "Okkadu Spirit", "Athadu Action", "Businessman",
  "Mirchi Spice", "Srimanthudu Pride", "Bharat Ane Nenu", "Maharshi Wisdom", "Sarileru Neekevvaru",
  "Nenu Local", "Fidaa Love", "Ninnu Kori Dream", "Ye Maaya Chesave", "Oh My Friend",
  "Nannaku Prematho", "Janatha Garage", "Jai Lava Kusa", "Aravinda Sametha", "Jr NTR Storm",
  "Temper Fire", "Baadshah Style", "Brindavanam Garden", "Adhurs Energy", "Yamadonga",
  "Student No.1", "Simhadri Power", "Annavaram Grace", "Shakti Divine", "Dubai Seenu",
  "Chatrapathi Roar", "Rebel Star", "Darling Love", "Mr Perfect", "Bujjigadu"
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSongs(count: number): Song[] {
  const songs: Song[] = [];
  const colors = [
    "from-rose-500 to-purple-600",
    "from-blue-500 to-cyan-400",
    "from-amber-500 to-red-500",
    "from-emerald-500 to-teal-400",
    "from-violet-500 to-pink-500",
    "from-orange-400 to-rose-500",
    "from-sky-400 to-indigo-500",
    "from-lime-400 to-green-600",
    "from-fuchsia-500 to-purple-700",
    "from-yellow-400 to-orange-500",
  ];

  for (let i = 0; i < count; i++) {
    const isHindi = i % 2 === 0;
    const lang = isHindi ? "Hindi" : "Telugu" as const;
    const year = 1990 + Math.floor(Math.random() * 36);
    const titles = isHindi ? hindiTitles : teluguTitles;
    const singers = isHindi ? hindiSingers : teluguSingers;
    const actors = isHindi ? hindiActors : teluguActors;
    const mds = isHindi ? hindiMDs : teluguMDs;

    songs.push({
      id: `song-${i + 1}`,
      title: titles[i % titles.length] + (i >= titles.length * 2 ? ` ${Math.floor(i / titles.length)}` : i >= titles.length ? " 2" : ""),
      artist: pick(singers),
      language: lang,
      year,
      genre: pick(genres),
      duration: 180 + Math.floor(Math.random() * 180),
      albumArt: pick(colors),
      musicDirector: pick(mds),
      actor: pick(actors),
    });
  }
  return songs;
}

export const allSongs = generateSongs(500);

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
