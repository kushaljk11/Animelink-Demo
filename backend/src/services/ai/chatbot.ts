// Offline bilingual (EN/NE) guidance chatbot (Section T.2–T.3).
//
// Rule-based intent matcher. Safety rules run FIRST and short-circuit: any
// mention of a human bite/scratch exposure, or a request to diagnose an animal,
// returns professional-help guidance and is flagged `safetyEscalated` for the
// T.5 evaluation ("ability to avoid unsafe medical conclusions").
import type { Locale } from "@prisma/client";

export type ChatLink = { label: string; href: string };
export type ChatReply = {
  intent: string;
  answer: string;
  safetyEscalated: boolean;
  suggestions: string[];
  links: ChatLink[];
  locale: Locale;
};

type Bi = { EN: string; NE: string };
type Intent = {
  id: string;
  /** Each matching pattern adds its weight; the highest total wins. */
  patterns: { re: RegExp; w: number }[];
  answer: Bi;
  links?: { label: Bi; href: string }[];
  suggestions?: Bi[];
};

const DEVANAGARI = /[ऀ-ॿ]/;

export function detectLocale(text: string, preferred?: Locale): Locale {
  if (preferred) return preferred;
  return DEVANAGARI.test(text) ? "NE" : "EN";
}

/** Removes emails and phone numbers before a question is stored (Section T.4 / U). */
export function scrubPii(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, "[phone]");
}

// ------------------------------------------------------------------ safety ---

const BITE_EXPOSURE = [
  /\b(bit|bitten|bite[sd]?|biting)\b/i,
  /\bscratch(ed|es)?\b/i,
  /\blick(ed)?\b.*\b(wound|cut|eye|mouth)\b/i,
  /\bsaliva\b/i,
  /टोक(्यो|ेको|ेर|्दा|ियो|्यौ)/,
  /कोतार|चिथोर|र्‍याल|र्याल/,
];
const DIAGNOSIS_REQUEST = [
  /\b(does|is|has|could|might)\b.*\b(rabies|rabid)\b/i,
  /\b(rabies|rabid)\b.*\b(symptom|sign)s?\b/i,
  /\b(symptom|sign)s?\b.*\b(rabies|rabid)\b/i,
  /\bdiagnos/i,
  /\bfoam(ing)?\b.*\bmouth\b/i,
  /रेबिज.*(छ|लाग्यो|भयो|लक्षण)/,
  /लक्षण/,
];

const BITE_REPLY: Bi = {
  EN: [
    "⚠️ If a person has been bitten, scratched or licked on broken skin, treat it as urgent:",
    "1. Wash the wound immediately with soap and running water for at least 15 minutes.",
    "2. Apply an antiseptic (povidone-iodine or alcohol) if available. Do not cover tightly or stitch.",
    "3. Go to the nearest hospital or health facility TODAY for anti-rabies post-exposure treatment — do not wait for symptoms. In Kathmandu, Sukraraj Tropical & Infectious Disease Hospital (Teku) treats animal-bite cases.",
    "4. If possible, note what the animal looked like and where it is, but do not try to catch it.",
    "I can't assess the wound or tell whether the animal has rabies — only a medical professional can. In an emergency call 102 for an ambulance.",
    "You can report the incident so local authorities can monitor the area.",
  ].join("\n"),
  NE: [
    "⚠️ कसैलाई जनावरले टोकेको, कोतारेको वा घाउमा चाटेको छ भने यसलाई आपतकालीन रूपमा लिनुहोस्:",
    "१. घाउलाई तुरुन्तै साबुन र बगिरहेको पानीले कम्तीमा १५ मिनेट धुनुहोस्।",
    "२. उपलब्ध भए एन्टिसेप्टिक (पोभिडोन-आयोडिन वा स्पिरिट) लगाउनुहोस्। घाउ कसेर नबाँध्नुहोस्, नसिलाउनुहोस्।",
    "३. आजै नजिकको अस्पताल वा स्वास्थ्य संस्थामा गएर रेबिज विरुद्धको उपचार (खोप) लिनुहोस् — लक्षण देखिने पर्खनु हुँदैन। काठमाडौंमा शुक्रराज ट्रपिकल तथा सरुवा रोग अस्पताल (टेकु) ले जनावरको टोकाइको उपचार गर्छ।",
    "४. सम्भव भए जनावर कस्तो थियो र कहाँ छ भन्ने याद गर्नुहोस्, तर समात्ने प्रयास नगर्नुहोस्।",
    "म घाउको जाँच गर्न वा जनावरलाई रेबिज छ कि छैन भन्न सक्दिनँ — यो स्वास्थ्यकर्मीले मात्र गर्न सक्छन्। आपतकालमा एम्बुलेन्सका लागि १०२ मा फोन गर्नुहोस्।",
    "स्थानीय निकायले क्षेत्रको अनुगमन गर्न सकून् भनेर घटनाको रिपोर्ट गर्न सक्नुहुन्छ।",
  ].join("\n"),
};

const DIAGNOSIS_REPLY: Bi = {
  EN: [
    "I can't diagnose rabies or any other illness — please contact a registered veterinarian.",
    "If an animal is acting strangely (unusual aggression, drooling, difficulty swallowing, paralysis, hiding):",
    "• Keep people and other animals away from it and avoid touching its saliva.",
    "• If it is your pet, confine it safely and call your vet right away.",
    "• If it is a stray, contact a rescue organisation or report it as a suspected-rabies incident.",
    "• If anyone has been bitten or scratched, wash the wound for 15 minutes and go to a hospital today.",
  ].join("\n"),
  NE: [
    "म रेबिज वा अन्य कुनै रोगको निदान गर्न सक्दिनँ — कृपया दर्ता भएका पशु चिकित्सकसँग सम्पर्क गर्नुहोस्।",
    "जनावर असामान्य व्यवहार गर्दैछ भने (अस्वाभाविक आक्रामकता, र्‍याल चुहिनु, निल्न गाह्रो, पक्षाघात, लुक्ने):",
    "• मानिस र अरू जनावरलाई टाढा राख्नुहोस्, यसको र्‍याल नछुनुहोस्।",
    "• आफ्नो घरपालुवा भए सुरक्षित रूपमा छुट्टै राखेर तुरुन्त पशु चिकित्सकलाई फोन गर्नुहोस्।",
    "• छाडा जनावर भए उद्धार संस्थालाई खबर गर्नुहोस् वा शंकास्पद रेबिज घटनाको रिपोर्ट गर्नुहोस्।",
    "• कसैलाई टोकेको वा कोतारेको छ भने घाउ १५ मिनेट धोएर आजै अस्पताल जानुहोस्।",
  ].join("\n"),
};

// ----------------------------------------------------------------- intents ---

const INTENTS: Intent[] = [
  {
    id: "greeting",
    patterns: [
      { re: /^\s*(hi|hello|hey|namaste|namaskar)\b/i, w: 2 },
      { re: /नमस्ते|नमस्कार/, w: 2 },
    ],
    answer: {
      EN: "Namaste! I'm the Rabies Track Nepal assistant. I can help with registering pets, vaccination schedules, QR tags, lost pets, reporting bites, and finding nearby vets or shelters.",
      NE: "नमस्ते! म Rabies Track Nepal सहायक हुँ। घरपालुवा दर्ता, खोप तालिका, QR ट्याग, हराएका जनावर, टोकाइको रिपोर्ट, र नजिकका पशु चिकित्सक वा आश्रय खोज्न मद्दत गर्न सक्छु।",
    },
    suggestions: [
      { EN: "How do I register my pet?", NE: "घरपालुवा कसरी दर्ता गर्ने?" },
      { EN: "When is the rabies booster due?", NE: "रेबिज बुस्टर कहिले लगाउने?" },
      { EN: "Find a vet near me", NE: "नजिकको पशु चिकित्सक खोज्नुहोस्" },
    ],
  },
  {
    id: "register_pet",
    patterns: [
      { re: /\b(register|add|create)\b.*\b(pet|dog|cat|profile)\b/i, w: 3 },
      { re: /\bpet profile\b/i, w: 2 },
      { re: /दर्ता/, w: 2 },
    ],
    answer: {
      EN: "To register a pet: sign in → My Pets → Add pet. Enter name, species, gender, date of birth and colour, and upload a clear photo (the breed finder can suggest a breed from it). A unique QR code is created automatically once the pet is saved.",
      NE: "घरपालुवा दर्ता गर्न: लगइन → मेरा घरपालुवा → घरपालुवा थप्नुहोस्। नाम, प्रजाति, लिङ्ग, जन्म मिति र रङ भर्नुहोस् र स्पष्ट फोटो अपलोड गर्नुहोस् (फोटोबाट नस्ल सुझाव पनि पाउन सकिन्छ)। सेभ गरेपछि एउटा अनौठो QR कोड आफैं बन्छ।",
    },
    links: [{ label: { EN: "Add a pet", NE: "घरपालुवा थप्नुहोस्" }, href: "/app/pets/new" }],
  },
  {
    id: "vaccination_schedule",
    patterns: [
      { re: /\b(vaccin\w*|booster|shot|jab|immuni[sz]\w*|schedule)\b/i, w: 2 },
      { re: /\b(when|how often|due)\b/i, w: 1 },
      { re: /खोप|बुस्टर/, w: 2 },
    ],
    answer: {
      EN: "General guidance (your vet decides the exact schedule): puppies and kittens usually get their first rabies vaccine at around 3 months of age, with a booster after one year, then boosters as recommended by the vaccine label — commonly every year in Nepal. Your pet's status shows as Up to Date, Due Soon or Overdue, and you'll get a reminder before each booster date. Only verified clinics can add or confirm vaccination records.",
      NE: "सामान्य जानकारी (ठ्याक्कै तालिका पशु चिकित्सकले तय गर्छन्): कुकुर/बिरालोका बच्चालाई प्रायः करिब ३ महिनामा पहिलो रेबिज खोप, एक वर्षपछि बुस्टर, र त्यसपछि खोपको निर्देशन अनुसार — नेपालमा प्रायः हरेक वर्ष — बुस्टर दिइन्छ। तपाईंको घरपालुवाको स्थिति \"अद्यावधिक\", \"चाँडै आउँदै\" वा \"म्याद नाघेको\" देखिन्छ र हरेक बुस्टर अघि सम्झना पाउनुहुन्छ। प्रमाणित क्लिनिकले मात्र खोप रेकर्ड थप्न वा पुष्टि गर्न सक्छन्।",
    },
    links: [{ label: { EN: "My pets", NE: "मेरा घरपालुवा" }, href: "/app/pets" }],
  },
  {
    id: "certificate",
    patterns: [
      { re: /\bcertificate\b/i, w: 3 },
      { re: /\b(pdf|download|proof)\b/i, w: 1 },
      { re: /प्रमाणपत्र/, w: 3 },
    ],
    answer: {
      EN: "Open your pet's profile and choose Download certificate. The PDF lists every vet-verified vaccination with batch numbers and includes your pet's QR code so anyone can check it.",
      NE: "आफ्नो घरपालुवाको प्रोफाइल खोलेर \"प्रमाणपत्र डाउनलोड\" छान्नुहोस्। PDF मा पशु चिकित्सकले प्रमाणित गरेका सबै खोप ब्याच नम्बरसहित हुन्छन् र जाँच गर्न मिल्ने QR कोड पनि हुन्छ।",
    },
  },
  {
    id: "qr_how",
    patterns: [
      { re: /\bqr\b/i, w: 3 },
      { re: /\b(tag|scan|collar)\b/i, w: 1 },
      { re: /क्यूआर|स्क्यान/, w: 3 },
    ],
    answer: {
      EN: "Every registered pet gets a unique QR code. Print it on a collar tag. When someone scans it they see a public emergency profile — pet name, photo and vaccination status. Your phone number is only shown while the pet is marked lost; otherwise the finder can send you a message through the app. Your home address is never shown.",
      NE: "दर्ता भएका हरेक घरपालुवालाई अनौठो QR कोड दिइन्छ। यसलाई घाँटीको ट्यागमा छाप्नुहोस्। कसैले स्क्यान गरेमा घरपालुवाको नाम, फोटो र खोप स्थिति भएको सार्वजनिक आपतकालीन प्रोफाइल देख्छन्। तपाईंको फोन नम्बर घरपालुवा \"हराएको\" अवस्थामा मात्र देखिन्छ; अन्यथा भेट्टाउनेले एपमार्फत सन्देश पठाउन सक्छन्। तपाईंको घरको ठेगाना कहिल्यै देखाइँदैन।",
    },
  },
  {
    id: "lost_pet",
    patterns: [
      { re: /\b(lost|missing|ran away|run away|found a (dog|cat|pet))\b/i, w: 3 },
      { re: /हरा(एको|यो|ायो)|भाग्यो|भेटियो/, w: 3 },
    ],
    answer: {
      EN: "If your pet is missing: open its profile → Mark as lost, and add where and when it was last seen. Anyone who scans its QR tag will then see your contact number and can share the location where they found it — you'll get an instant notification. When your pet is home, choose Mark as found.\nIf you found a pet with a tag, scan the QR code to contact the owner.",
      NE: "घरपालुवा हराएमा: प्रोफाइल खोल्नुहोस् → \"हराएको\" चिन्ह लगाउनुहोस्, र अन्तिम पटक कहाँ र कहिले देखिएको थियो लेख्नुहोस्। त्यसपछि QR ट्याग स्क्यान गर्नेले तपाईंको सम्पर्क नम्बर देख्छन् र भेटेको स्थान पठाउन सक्छन् — तपाईंलाई तुरुन्त सूचना आउँछ। घरपालुवा फर्केपछि \"भेटियो\" छान्नुहोस्।\nट्याग भएको घरपालुवा भेट्टाउनुभयो भने मालिकलाई सम्पर्क गर्न QR कोड स्क्यान गर्नुहोस्।",
    },
    links: [{ label: { EN: "Lost pets", NE: "हराएका घरपालुवा" }, href: "/lost" }],
  },
  {
    id: "report_incident",
    patterns: [
      { re: /\breport\b/i, w: 2 },
      { re: /\b(incident|attack|aggressive|rabid|suspected)\b/i, w: 2 },
      { re: /रिपोर्ट|उजुरी|घटना/, w: 2 },
    ],
    answer: {
      EN: "To report an animal-bite or suspected-rabies incident, open Report incident. Choose the animal type and severity, describe what happened, add a photo if it is safe, and share your GPS location (or tap the map). Reports can be submitted without an account. Ward officers review every report and the location is added to the surveillance map.",
      NE: "जनावरको टोकाइ वा शंकास्पद रेबिज घटनाको रिपोर्ट गर्न \"घटना रिपोर्ट\" खोल्नुहोस्। जनावरको प्रकार र गम्भीरता छान्नुहोस्, के भयो लेख्नुहोस्, सुरक्षित भए फोटो थप्नुहोस्, र GPS स्थान दिनुहोस् (वा नक्सामा थिच्नुहोस्)। खाता बिना पनि रिपोर्ट गर्न सकिन्छ। वडा अधिकारीले हरेक रिपोर्ट हेर्छन् र स्थान निगरानी नक्सामा थपिन्छ।",
    },
    links: [{ label: { EN: "Report an incident", NE: "घटना रिपोर्ट गर्नुहोस्" }, href: "/report" }],
  },
  {
    id: "find_vet",
    patterns: [
      { re: /\b(vet|vets|veterinar\w*|clinic|hospital for (my )?(dog|cat|pet))\b/i, w: 2 },
      { re: /\b(near|nearby|closest|nearest|find)\b/i, w: 1 },
      { re: /पशु\s*चिकित्सक|भेट|क्लिनिक|नजिक/, w: 2 },
    ],
    answer: {
      EN: "Open Nearby services and allow location access (or pick a point on the map). You'll see verified veterinary clinics within your chosen radius, sorted by distance, with phone numbers and opening hours.",
      NE: "\"नजिकका सेवा\" खोलेर स्थान अनुमति दिनुहोस् (वा नक्सामा बिन्दु छान्नुहोस्)। तपाईंले छानेको दूरीभित्रका प्रमाणित पशु क्लिनिकहरू दूरी अनुसार फोन नम्बर र खुल्ने समयसहित देख्नुहुनेछ।",
    },
    links: [{ label: { EN: "Nearby services", NE: "नजिकका सेवा" }, href: "/nearby" }],
  },
  {
    id: "find_shelter",
    patterns: [
      { re: /\b(shelter|rescue|ngo|adopt\w*|stray)\b/i, w: 2 },
      { re: /आश्रय|उद्धार|छाडा/, w: 2 },
    ],
    answer: {
      EN: "Rescue organisations and shelters are listed under Nearby services → Shelters. For an injured or sick stray, contact the closest organisation. If the stray bit someone or seems unwell, also submit an incident report.",
      NE: "उद्धार संस्था र आश्रयहरू \"नजिकका सेवा\" → \"आश्रय\" मा छन्। घाइते वा बिरामी छाडा जनावरका लागि नजिकको संस्थालाई सम्पर्क गर्नुहोस्। छाडा जनावरले कसैलाई टोकेको वा बिरामी देखिएमा घटना रिपोर्ट पनि गर्नुहोस्।",
    },
    links: [{ label: { EN: "Nearby shelters", NE: "नजिकका आश्रय" }, href: "/nearby?types=shelter" }],
  },
  {
    id: "cnvr_info",
    patterns: [
      { re: /\b(cnvr|sterili[sz]\w*|neuter\w*|spay\w*|ear ?(mark|notch|tip))\b/i, w: 3 },
      { re: /बन्ध्याकरण|खसी/, w: 3 },
    ],
    answer: {
      EN: "CNVR means Catch, Neuter, Vaccinate, Release. Rescue organisations catch community dogs, sterilise and vaccinate them, mark them (usually an ear notch or tag) and release them where they were found. This platform records each step and its location so the same dog isn't treated twice, and so ward officers can see coverage on the map.",
      NE: "CNVR भनेको समात्ने, बन्ध्याकरण गर्ने, खोप लगाउने र छाड्ने हो। उद्धार संस्थाले सामुदायिक कुकुर समातेर बन्ध्याकरण र खोप गर्छन्, चिन्ह लगाउँछन् (प्रायः कानमा काट वा ट्याग) र भेटेकै ठाउँमा छाड्छन्। यो प्रणालीले हरेक चरण र स्थान रेकर्ड गर्छ ताकि एउटै कुकुरको दोहोरो उपचार नहोस् र वडा अधिकारीले नक्सामा देख्न सकून्।",
    },
  },
  {
    id: "breed_finder",
    patterns: [
      { re: /\bbreed\b/i, w: 3 },
      { re: /\b(what kind|which type)\b/i, w: 1 },
      { re: /नस्ल|जात/, w: 3 },
    ],
    answer: {
      EN: "Upload a clear, well-lit photo of your pet when adding or editing it, and the breed finder will suggest the most likely breeds. It's only a suggestion — mixed and local breeds are common in Nepal, so please confirm or correct it.",
      NE: "घरपालुवा थप्दा वा सम्पादन गर्दा राम्रो उज्यालोमा खिचिएको स्पष्ट फोटो अपलोड गर्नुहोस्, नस्ल खोजकर्ताले सम्भावित नस्ल सुझाव दिन्छ। यो सुझाव मात्र हो — नेपालमा मिश्रित र स्थानीय नस्ल धेरै हुन्छन्, त्यसैले पुष्टि वा सच्याउनुहोस्।",
    },
  },
  {
    id: "pet_care_general",
    patterns: [
      { re: /\b(feed|food|diet|groom\w*|bath\w*|deworm\w*|tick|flea|exercise|care)\b/i, w: 2 },
      { re: /खाना|नुहाउ|जुका|किर्ना|हेरचाह/, w: 2 },
    ],
    answer: {
      EN: "General care tips: fresh water at all times; a balanced diet suited to age and size (avoid onions, grapes, chocolate and cooked bones); deworming every 3–6 months and tick/flea prevention, especially in the monsoon; daily exercise; and a yearly vet check-up alongside vaccinations. For any health concern, please consult a veterinarian.",
      NE: "सामान्य हेरचाह: सधैं सफा पानी; उमेर र आकार अनुसार सन्तुलित खाना (प्याज, अंगुर, चकलेट र पकाएको हड्डी नदिनुहोस्); हरेक ३–६ महिनामा जुकाको औषधि र विशेषगरी बर्खामा किर्ना/उपियाँ रोकथाम; दैनिक व्यायाम; र खोपसँगै वार्षिक स्वास्थ्य जाँच। कुनै स्वास्थ्य समस्या भए पशु चिकित्सकसँग परामर्श गर्नुहोस्।",
    },
  },
  {
    id: "language",
    patterns: [
      { re: /\b(nepali|english|language)\b/i, w: 3 },
      { re: /नेपाली|अंग्रेजी|भाषा/, w: 3 },
    ],
    answer: {
      EN: "The app works in English and Nepali. Switch language from the profile menu, or just type your question in Nepali and I'll reply in Nepali.",
      NE: "यो एप अंग्रेजी र नेपाली दुवैमा चल्छ। प्रोफाइल मेनुबाट भाषा बदल्नुहोस्, वा नेपालीमा प्रश्न लेख्नुहोस्, म नेपालीमै जवाफ दिन्छु।",
    },
  },
];

const FALLBACK: Intent = {
  id: "fallback",
  patterns: [],
  answer: {
    EN: "I'm not sure I understood. I can help with: registering a pet, vaccination reminders and certificates, QR tags, lost pets, reporting bites or suspected rabies, CNVR, and finding nearby vets or shelters. For medical questions about a person or animal, please contact a doctor or veterinarian.",
    NE: "मैले बुझिनँ जस्तो छ। म यसमा मद्दत गर्न सक्छु: घरपालुवा दर्ता, खोप सम्झना र प्रमाणपत्र, QR ट्याग, हराएका घरपालुवा, टोकाइ वा शंकास्पद रेबिजको रिपोर्ट, CNVR, र नजिकका पशु चिकित्सक वा आश्रय खोज्ने। मानिस वा जनावरको स्वास्थ्यसम्बन्धी प्रश्नका लागि डाक्टर वा पशु चिकित्सकसँग सम्पर्क गर्नुहोस्।",
  },
  suggestions: [
    { EN: "How do QR tags work?", NE: "QR ट्याग कसरी काम गर्छ?" },
    { EN: "My dog is lost", NE: "मेरो कुकुर हरायो" },
    { EN: "How do I report a dog bite?", NE: "कुकुरको टोकाइ कसरी रिपोर्ट गर्ने?" },
  ],
};

function build(intent: Intent, locale: Locale, safety: boolean, answer?: string, extraLinks: ChatLink[] = []): ChatReply {
  return {
    intent: intent.id,
    answer: answer ?? intent.answer[locale],
    safetyEscalated: safety,
    suggestions: (intent.suggestions ?? []).map((s) => s[locale]),
    links: [...(intent.links ?? []).map((l) => ({ label: l.label[locale], href: l.href })), ...extraLinks],
    locale,
  };
}

export function reply(message: string, preferredLocale?: Locale): ChatReply {
  const locale = detectLocale(message, preferredLocale);
  const text = message.normalize("NFC");

  // Diagnosis requests are checked before bites: "is the dog that bit me rabid?"
  // must get both refusals, so it is folded into the bite reply below.
  const asksDiagnosis = DIAGNOSIS_REQUEST.some((re) => re.test(text));
  if (BITE_EXPOSURE.some((re) => re.test(text))) {
    const answer = asksDiagnosis
      ? `${BITE_REPLY[locale]}\n\n${locale === "NE" ? "जनावरमा रेबिज छ कि छैन भन्ने कुरा म भन्न सक्दिनँ।" : "I can't tell you whether the animal has rabies."}`
      : BITE_REPLY[locale];
    return build({ id: "safety_bite_exposure", patterns: [], answer: BITE_REPLY }, locale, true, answer, [
      { label: locale === "NE" ? "घटना रिपोर्ट गर्नुहोस्" : "Report the incident", href: "/report" },
      { label: locale === "NE" ? "नजिकका सेवा" : "Nearby services", href: "/nearby" },
    ]);
  }
  if (asksDiagnosis) {
    return build({ id: "safety_no_diagnosis", patterns: [], answer: DIAGNOSIS_REPLY }, locale, true, undefined, [
      { label: locale === "NE" ? "नजिकको पशु चिकित्सक" : "Find a vet", href: "/nearby?types=clinic" },
      { label: locale === "NE" ? "घटना रिपोर्ट गर्नुहोस्" : "Report suspected rabies", href: "/report" },
    ]);
  }

  let best: Intent = FALLBACK;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const score = intent.patterns.reduce((s, p) => (p.re.test(text) ? s + p.w : s), 0);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return build(bestScore >= 2 ? best : FALLBACK, locale, false);
}

export const CHATBOT_VERSION = "rules-v1";
