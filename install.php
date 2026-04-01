<?php
/**
 * 🛡️ TeamZero - PingZero NMS Automated Installer
 * Developed by TeamZero (https://teamzero.bd)
 */

session_start();
$repo_url = "https://github.com/nurexbt/pingzero.git"; 
$install_path = "/var/www/pingzero";

// UI Helpers
function render_header($title) {
    echo "<!DOCTYPE html>
    <html lang='en'>
    <head>
        <meta charset='UTF-8'>
        <meta name='viewport' content='width=device-width, initial-scale=1.0'>
        <title>$title | TeamZero Installer</title>
        <script src='https://cdn.tailwindcss.com'></script>
        <link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap' rel='stylesheet'>
        <style>
            body { font-family: 'Inter', sans-serif; background: #0a0a0c; color: #e2e8f0; }
            .glass { background: rgba(17, 17, 20, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); }
            .terminal { background: #000; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #10b981; padding: 20px; border-radius: 12px; border: 1px solid #18181b; max-height: 400px; overflow-y: auto; }
            .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        </style>
    </head>
    <body class='p-6 md:p-12 min-h-screen flex flex-col items-center'>";
}

function render_footer() {
    echo "</body></html>";
}

$action = isset($_GET['action']) ? $_GET['action'] : 'welcome';

if ($action === 'welcome') {
    render_header("Welcome");
    ?>
    <div class="max-w-2xl w-full glass p-10 rounded-[2.5rem] text-center shadow-2xl">
        <div class="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-600/20">
            <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <h1 class="text-4xl font-extrabold tracking-tighter text-white mb-4 uppercase">PING<span class="text-indigo-400">ZERO</span> INSTALLER</h1>
        <p class="text-slate-400 mb-8 leading-relaxed">This script will automatically configure your Ubuntu server, install dependencies (Node.js, Python, PM2), and deploy the PingZero NMS dashboard.</p>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-10">
            <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Target Engine</p>
                <p class="text-sm font-semibold text-white">Next.js + Python</p>
            </div>
            <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">OS Compatibility</p>
                <p class="text-sm font-semibold text-white">Ubuntu 20.04+</p>
            </div>
        </div>

        <a href="?action=install" class="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 text-center">
            Start Installation 🚀
        </a>
        <p class="text-[10px] text-slate-500 mt-6 uppercase tracking-widest">© 2026 TeamZero • teamzero.bd</p>
    </div>
    <?php
    render_footer();
} 

elseif ($action === 'install') {
    render_header("Installing...");
    ?>
    <div class="max-w-4xl w-full glass p-10 rounded-[2.5rem] shadow-2xl">
        <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-bold text-white tracking-tight">System Deployment Progress</h2>
            <div class="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest pulse">
                In Progress
            </div>
        </div>

        <div class="terminal" id="terminal-log">
            [INFO] Starting deployment sequence...<br>
            [INFO] Checking PHP shell_exec permission... OK<br>
        </div>

        <div id="status-footer" class="mt-8 flex justify-between items-center text-xs text-slate-500 uppercase font-bold tracking-widest">
            <span>Server: <?php echo php_uname('n'); ?></span>
            <span id="final-cta" class="hidden">
                <a href="/" class="text-indigo-400 hover:text-white">Visit Dashboard →</a>
            </span>
        </div>
    </div>

    <script>
        const terminal = document.getElementById('terminal-log');
        const cta = document.getElementById('final-cta');

        async function runStep(label, cmd) {
            terminal.innerHTML += `<span class='text-white'>[PROC] ${label}...</span><br>`;
            terminal.scrollTop = terminal.scrollHeight;
            
            try {
                const res = await fetch(`?action=execute&cmd=${btoa(cmd)}`);
                const data = await res.text();
                terminal.innerHTML += data + "<br>";
            } catch (e) {
                terminal.innerHTML += `<span class='text-red-500'>[FAIL] ${label} failed.</span><br>`;
            }
            terminal.scrollTop = terminal.scrollHeight;
        }

        async function start() {
            await runStep("Updating system packages", "sudo apt update -y");
            await runStep("Installing Python Pip", "sudo apt install python3-pip -y");
            await runStep("Installing PYSNMP", "pip3 install pysnmp");
            await runStep("Installing PM2", "sudo npm install -g pm2");
            await runStep("Building Application", "npm run build");
            await runStep("Starting with PM2", "pm2 delete pingzero-nms 2>/dev/null; pm2 start server.js --name pingzero-nms && pm2 save");
            
            terminal.innerHTML += `<br><span class='text-emerald-400 font-bold'>[SUCCESS] Installation Complete! The NMS is now running on port 3000.</span><br>`;
            cta.classList.remove('hidden');
        }

        window.onload = start;
    </script>
    <?php
    render_footer();
}

elseif ($action === 'execute') {
    $cmd = base64_decode($_GET['cmd']);
    // Filter common dangerous commands if needed
    echo "<span class='text-slate-500'>$ " . htmlspecialchars($cmd) . "</span><br>";
    $output = shell_exec($cmd . " 2>&1");
    echo nl2br(htmlspecialchars($output));
}
?>
