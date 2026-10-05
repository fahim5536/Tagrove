# StockMeta

ছবির জন্য Adobe Stock মেটাডেটা (Title, Keywords, Category) স্বয়ংক্রিয়ভাবে তৈরি করার Windows ডেস্কটপ অ্যাপ। Google Gemini (vision) দিয়ে ছবি দেখে ইংরেজি মেটাডেটা বানায়, আর আপনি টেবিলে বসে সেগুলো সম্পাদনা করে Adobe Stock-এর CSV হিসেবে এক্সপোর্ট করতে পারেন।

**Tech stack:** C# / .NET 8 + WPF, MVVM (CommunityToolkit.Mvvm), WPF-UI dark theme, SkiaSharp (image resize), CsvHelper (export), Windows Credential Manager (API key storage)।

## ফিচার

1. একসাথে অনেকগুলো ছবি যোগ করা — ড্র্যাগ-ড্রপ বা ফাইল পিকার দিয়ে (JPG, PNG, WEBP)
2. প্রতিটি ছবির জন্য Gemini ভিশন কল:
   - **Title:** বর্ণনামূলক, সর্বোচ্চ ২০০ অক্ষর, কোনো ব্র্যান্ড/ট্রেডমার্ক/শিল্পীর নাম নেই
   - **Keywords:** ৩০–৪৯টি, কমা দিয়ে আলাদা, সবচেয়ে প্রাসঙ্গিক আগে, ব্র্যান্ড/শিল্পীর নাম নেই
   - **Category:** Adobe Stock-এর ২১টি ক্যাটাগরির একটি
3. সম্পাদনাযোগ্য টেবিল — থাম্বনেইল, ফাইলনেম, title, keywords, category, keyword count; title > ২০০ অক্ষর বা keywords > ৪৯ হলে লাল সতর্কতা, ৩০-এর কম keywords হলে হলুদ সতর্কতা
4. প্রতি সারিতে **Regenerate** বোতাম + সব একসাথে **Generate All** (প্রোগ্রেস বারসহ)
5. **Export CSV** — কলাম ঠিক এভাবে: `Filename, Title, Keywords, Category, Releases`
6. **Settings:** Gemini API key, মডেল নাম (যেমন `gemini-2.5-flash`), "AI-generated content" চেকবক্স
7. এরর হ্যান্ডলিং — invalid key, rate limit (429), নেটওয়ার্ক ফেল ইত্যাদিতে অটো-রিট্রাই ও পরিষ্কার মেসেজ
8. আধুনিক ডার্ক UI; ছবি প্রসেস হয় ছোট প্যারালাল ব্যাচে (সর্বোচ্চ ৩টি Gemini কল একসাথে)

## এই মেশিনে চালানো (development)

.NET 8 SDK ইতিমধ্যে per-user ইনস্টল করা আছে: `%LOCALAPPDATA%\Microsoft\dotnet` (নতুন টার্মিনালে PATH-এ থাকবে)।

1. প্রজেক্ট ফোল্ডারে যান: `cd D:\metadataapp`
2. রান করুন:
   ```
   dotnet build
   dotnet run
   ```

## .exe বানানো (publish)

```
dotnet publish -c Release
```

আউটপুট ফোল্ডার:

```
D:\metadataapp\bin\Release\net8.0-windows\win-x64\publish\
```

- `StockMeta.exe` — মূল অ্যাপ (≈৬৩ MB, ভেতরে .NET runtime + সব লাইব্রেরি কমপ্রেস করা আছে)
- পাশে ৬টি ছোট native DLL (`wpfgfx_cor3.dll`, `PresentationNative_cor3.dll`, `libSkiaSharp.dll` ইত্যাদি) — WPF ও SkiaSharp-এর native রানটাইম ফাইল, Microsoft-এর নিয়মে WPF single-file publish-এ এগুলো exe-এর পাশেই থাকে
- **বিতরণ করতে:** পুরো `publish` ফোল্ডারটা zip করে দিন — ভেতরের `StockMeta.exe`-এ ডাবল ক্লিক করলেই চলবে
- **Self-contained:** টার্গেট PC-তে .NET বা অন্য কিছু ইনস্টল করা লাগবে না (শুধু Windows 10/11 x64 চাই)

## API key ও নিরাপত্তা

1. ফ্রি key নিন: <https://aistudio.google.com/apikey>
2. অ্যাপের **Settings**-এ key পেস্ট করুন
3. key সংরক্ষিত হয় **Windows Credential Manager**-এ (target: `StockMeta/GeminiApiKey`, DPAPI-এনক্রিপ্টেড) — ডিস্কের কোনো ফাইলে বা লগে কখনো লেখা হয় না, সোর্স কোডে হার্ডকোড নেই
4. বাকি সেটিংস (model, AI-content ফ্ল্যাগ) থাকে `%APPDATA%\StockMeta\settings.json`-এ — এই ফাইলে key নেই, নিজে খুলে দেখতে পারেন
5. Gemini কলে key যায় শুধু `x-goog-api-key` HTTP হেডারে (URL-এ নয়)

## পরীক্ষা সম্পর্কে স্বচ্ছতা

- বিল্ড ও publish সফল, এবং অ্যাপটা চালিয়ে যাচাই করা হয়েছে (উইন্ডো খোলে, ক্র্যাশ নেই)
- কিন্তু ব্যক্তিগত API key ছাড়া Gemini কল ও CSV এক্সপোর্টের end-to-end টেস্ট করা হয়নি — নিজের key দিয়ে ২–১টা ছবি দিয়ে একবার Generate → Export চেক করে নিন
