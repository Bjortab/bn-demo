<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Blush Narratives</title>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="card top">
    <div class="brand"><strong>Blush</strong><span> Narratives</span></div>
    <nav>
      <a href="#" data-view="create" class="active">Skapa</a>
      <a href="#" data-view="connect">BlushConnect</a>
    </nav>
  </header>

  <main class="card" id="view-create">
    <h2>Skapa & lyssna</h2>

    <div class="row">
      <div class="field">
        <label for="length">Längd</label>
        <select id="length">
          <option value="3">3 min</option>
          <option value="5" selected>5 min</option>
          <option value="8">8 min</option>
        </select>
      </div>

      <div class="field">
        <label>Snusk-nivå</label>
        <div class="row compact">
          <label><input type="radio" name="spice" value="1" checked> 1</label>
          <label><input type="radio" name="spice" value="2"> 2</label>
          <label><input type="radio" name="spice" value="3"> 3</label>
          <label><input type="radio" name="spice" value="4"> 4</label>
          <label><input type="radio" name="spice" value="5"> 5</label>
        </div>
      </div>

      <div class="field">
        <label for="voice">Röst</label>
        <select id="voice">
          <option value="verse" selected>Verse (mjuk)</option>
          <option value="alloy">Alloy (neutral)</option>
          <option value="aria">Aria</option>
          <option value="shimmer">Shimmer</option>
          <option value="sage">Sage</option>
          <option value="nova">Nova</option>
        </select>
      </div>

      <div class="field">
        <label for="speed">Hastighet</label>
        <select id="speed">
          <option value="1.0" selected>1.00x</option>
          <option value="1.1">1.10x</option>
          <option value="1.25">1.25x</option>
          <option value="1.4">1.40x</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label for="idea">Din idé</label>
      <textarea id="idea" placeholder="Kort beskrivning (t.ex. 'första mötet i hissen…')" rows="5"></textarea>
    </div>

    <div class="row actions">
      <button id="btnRead" class="primary">Skapa & läs</button>
      <button id="btnMakeText" class="ghost">Skapa text</button>
      <button id="btnDownload" class="ghost">Ladda ner .txt</button>
      <span id="status" class="status"></span>
    </div>

    <audio id="player" controls preload="none"></audio>

    <div class="field">
      <h3>Berättelsetext</h3>
      <textarea id="story" class="story" rows="10" placeholder="Texten dyker upp här…"></textarea>
    </div>
  </main>

  <!-- BlushConnect (v1: lokal profil + sparat) -->
  <section class="card hidden" id="view-connect">
    <h2>BlushConnect</h2>
    <p class="muted">Första version: spara din profil lokalt. Senare kopplar vi på server-konton och matchning.</p>

    <div class="row">
      <div class="field">
        <label for="cnick">Visningsnamn</label>
        <input id="cnick" placeholder="Ditt alias" />
      </div>
      <div class="field">
        <label for="clevel">Favoritnivå</label>
        <select id="clevel">
          <option value="1">1</option><option value="2">2</option>
          <option value="3">3</option><option value="4">4</option>
          <option value="5">5</option>
        </select>
      </div>
    </div>

    <div class="row actions">
      <button id="csave" class="primary">Spara profil</button>
      <span id="cstatus" class="status"></span>
    </div>

    <h3>Favoriter (lokalt)</h3>
    <ul id="cfavs" class="list"></ul>
  </section>

  <footer class="card foot">© Blush Narratives</footer>

  <script src="./app.js"></script>
</body>
</html>
