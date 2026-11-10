import type { GlossaryBook, GlossaryWord } from "./glossaryData";

function words(entries: [string, string, string][]): GlossaryWord[] {
  return entries.map(([term_zh, term_fr, term_en]) => ({ term_zh, term_fr, term_en }));
}

export const textbookGlossaryBooks: GlossaryBook[] = [
  {
    title: "VHDL 数字设计 (Free Range VHDL)",
    source: {
      title: "Free Range VHDL",
      authors: "Bryan Mealy · Fabrizio Tappero",
      url: "https://github.com/fabriziotappero/Free-Range-VHDL-book",
    },
    modules: [
      {
        name: "设计单元与接口 (Unités de conception et interfaces)",
        words: words([
          ["实体", "Entité", "Entity"],
          ["结构体", "Architecture", "Architecture"],
          ["包", "Paquetage", "Package"],
          ["库声明", "Clause de bibliothèque", "Library clause"],
          ["配置声明", "Déclaration de configuration", "Configuration declaration"],
          ["泛型参数", "Paramètre générique", "Generic parameter"],
          ["端口映射", "Association des ports", "Port map"],
          ["泛型映射", "Association des génériques", "Generic map"],
        ]),
      },
      {
        name: "信号与数据类型 (Signaux et types de données)",
        words: words([
          ["标准逻辑类型", "Type std_logic", "Standard logic type (std_logic)"],
          ["标准逻辑向量", "Vecteur std_logic_vector", "Standard logic vector (std_logic_vector)"],
          ["有符号类型", "Type signé", "Signed type"],
          ["无符号类型", "Type non signé", "Unsigned type"],
          ["信号", "Signal", "Signal"],
          ["变量", "Variable", "Variable"],
          ["常量", "Constante", "Constant"],
          ["类型转换", "Conversion de type", "Type conversion"],
        ]),
      },
      {
        name: "进程与时序逻辑 (Processus et logique séquentielle)",
        words: words([
          ["进程", "Processus", "Process"],
          ["敏感列表", "Liste de sensibilité", "Sensitivity list"],
          ["上升沿", "Front montant", "Rising edge"],
          ["同步复位", "Remise à zéro synchrone", "Synchronous reset"],
          ["异步复位", "Remise à zéro asynchrone", "Asynchronous reset"],
          ["时钟使能", "Signal d’autorisation d’horloge", "Clock enable"],
          ["有限状态机", "Machine à états finis", "Finite state machine (FSM)"],
          ["状态寄存器", "Registre d’état", "State register"],
        ]),
      },
      {
        name: "仿真与验证 (Simulation et vérification)",
        words: words([
          ["测试平台", "Banc de test", "Testbench"],
          ["测试向量", "Vecteur de test", "Test vector"],
          ["激励信号", "Signal de stimulation", "Stimulus signal"],
          ["断言", "Assertion", "Assertion"],
          ["仿真时间", "Temps de simulation", "Simulation time"],
          ["传播延迟", "Retard de propagation", "Propagation delay"],
          ["德尔塔周期", "Cycle delta", "Delta cycle"],
          ["行为仿真", "Simulation comportementale", "Behavioral simulation"],
        ]),
      },
    ],
  },
  {
    title: "数字信号处理 (Digital Signal Processing)",
    source: {
      title: "The Scientist and Engineer’s Guide to Digital Signal Processing",
      authors: "Steven W. Smith",
      url: "https://www.dspguide.com/",
    },
    modules: [
      {
        name: "Z 域与频率响应 (Domaine Z et réponse fréquentielle)",
        words: words([
          ["Z 变换", "Transformée en Z", "Z-transform"],
          ["Z 平面", "Plan Z", "Z-plane"],
          ["单位圆", "Cercle unité", "Unit circle"],
          ["收敛域", "Domaine de convergence", "Region of convergence (ROC)"],
          ["传递函数", "Fonction de transfert", "Transfer function"],
          ["极点", "Pôle", "Pole"],
          ["零点", "Zéro", "Zero"],
          ["频率响应", "Réponse fréquentielle", "Frequency response"],
        ]),
      },
      {
        name: "FIR 滤波器设计 (Synthèse des filtres RIF)",
        words: words([
          ["有限冲激响应滤波器", "Filtre à réponse impulsionnelle finie (RIF)", "Finite impulse response filter (FIR)"],
          ["滑动平均滤波器", "Filtre à moyenne glissante", "Moving average filter"],
          ["窗函数法", "Méthode du fenêtrage", "Window method"],
          ["加窗 sinc 滤波器", "Filtre sinc fenêtré", "Windowed-sinc filter"],
          ["汉明窗", "Fenêtre de Hamming", "Hamming window"],
          ["冲激响应对称性", "Symétrie de la réponse impulsionnelle", "Impulse response symmetry"],
          ["过渡带", "Bande de transition", "Transition band"],
          ["阻带衰减", "Atténuation en bande d’arrêt", "Stopband attenuation"],
        ]),
      },
      {
        name: "IIR 滤波器实现 (Réalisation des filtres RII)",
        words: words([
          ["无限冲激响应滤波器", "Filtre à réponse impulsionnelle infinie (RII)", "Infinite impulse response filter (IIR)"],
          ["递归滤波器", "Filtre récursif", "Recursive filter"],
          ["差分方程", "Équation aux différences", "Difference equation"],
          ["直接 I 型", "Forme directe I", "Direct form I"],
          ["直接 II 型", "Forme directe II", "Direct form II"],
          ["二阶节", "Section du second ordre", "Second-order section"],
          ["双二次节", "Cellule biquadratique", "Biquad section"],
          ["级联结构", "Structure en cascade", "Cascade structure"],
        ]),
      },
      {
        name: "快速卷积与定点实现 (Convolution rapide et calcul en virgule fixe)",
        words: words([
          ["重叠相加法", "Méthode par recouvrement et addition", "Overlap-add method"],
          ["卷积核", "Noyau de convolution", "Convolution kernel"],
          ["补零", "Complétion par zéros", "Zero padding"],
          ["循环卷积", "Convolution circulaire", "Circular convolution"],
          ["分块处理", "Traitement par blocs", "Block processing"],
          ["系数量化", "Quantification des coefficients", "Coefficient quantization"],
          ["定点运算", "Calcul en virgule fixe", "Fixed-point arithmetic"],
          ["舍入噪声", "Bruit d’arrondi", "Round-off noise"],
        ]),
      },
    ],
  },
  {
    title: "反馈控制系统 (Feedback Systems)",
    source: {
      title: "Feedback Systems: An Introduction for Scientists and Engineers",
      authors: "Karl J. Åström · Richard M. Murray",
      url: "https://fbswiki.org/wiki/index.php/Feedback_Systems%3A_An_Introduction_for_Scientists_and_Engineers",
    },
    modules: [
      {
        name: "建模与状态空间 (Modélisation et espace d’état)",
        words: words([
          ["平衡点", "Point d’équilibre", "Equilibrium point"],
          ["状态空间模型", "Modèle d’état", "State-space model"],
          ["状态方程", "Équation d’état", "State equation"],
          ["输出方程", "Équation de sortie", "Output equation"],
          ["线性化", "Linéarisation", "Linearization"],
          ["可控性", "Commandabilité", "Controllability"],
          ["可观性", "Observabilité", "Observability"],
          ["开环系统", "Système en boucle ouverte", "Open-loop system"],
        ]),
      },
      {
        name: "暂态响应与 PID (Réponse transitoire et PID)",
        words: words([
          ["阶跃响应", "Réponse indicielle", "Step response"],
          ["超调量", "Dépassement", "Overshoot"],
          ["调节时间", "Temps d’établissement", "Settling time"],
          ["稳态误差", "Erreur en régime permanent", "Steady-state error"],
          ["PID 控制器", "Correcteur PID", "PID controller"],
          ["积分作用", "Action intégrale", "Integral action"],
          ["微分作用", "Action dérivée", "Derivative action"],
          ["积分饱和累积", "Emballement de l’intégrateur", "Integrator windup"],
        ]),
      },
      {
        name: "频域与稳定裕度 (Domaine fréquentiel et marges de stabilité)",
        words: words([
          ["伯德图", "Diagramme de Bode", "Bode plot"],
          ["奈奎斯特判据", "Critère de Nyquist", "Nyquist criterion"],
          ["增益裕度", "Marge de gain", "Gain margin"],
          ["相位裕度", "Marge de phase", "Phase margin"],
          ["增益交越频率", "Fréquence de croisement du gain à 0 dB", "Gain crossover frequency"],
          ["闭环带宽", "Bande passante en boucle fermée", "Closed-loop bandwidth"],
          ["灵敏度函数", "Fonction de sensibilité", "Sensitivity function"],
          ["互补灵敏度函数", "Fonction de sensibilité complémentaire", "Complementary sensitivity function"],
        ]),
      },
      {
        name: "反馈设计与鲁棒性 (Synthèse de commande et robustesse)",
        words: words([
          ["状态反馈", "Retour d’état", "State feedback"],
          ["极点配置", "Placement de pôles", "Pole placement"],
          ["状态观测器", "Observateur d’état", "State observer"],
          ["参考输入跟踪", "Suivi de consigne", "Reference tracking"],
          ["扰动抑制", "Rejet des perturbations", "Disturbance rejection"],
          ["模型不确定性", "Incertitude de modélisation", "Model uncertainty"],
          ["鲁棒稳定性", "Stabilité robuste", "Robust stability"],
          ["开环频率响应整形", "Mise en forme de la boucle", "Loop shaping"],
        ]),
      },
    ],
  },
  {
    title: "计算机网络 (Computer Networks)",
    source: {
      title: "Computer Networks: A Systems Approach",
      authors: "Larry Peterson · Bruce Davie",
      url: "https://github.com/SystemsApproach/book",
    },
    modules: [
      {
        name: "分组与数据链路 (Paquets et liaison de données)",
        words: words([
          ["分组交换", "Commutation de paquets", "Packet switching"],
          ["封装", "Encapsulation", "Encapsulation"],
          ["成帧", "Mise en trame", "Framing"],
          ["帧校验序列", "Séquence de contrôle de trame (FCS)", "Frame check sequence (FCS)"],
          ["介质访问控制", "Contrôle d’accès au support (MAC)", "Medium access control (MAC)"],
          ["以太网交换机", "Commutateur Ethernet", "Ethernet switch"],
          ["MAC 地址", "Adresse MAC", "MAC address"],
          ["循环冗余校验", "Contrôle de redondance cyclique (CRC)", "Cyclic redundancy check (CRC)"],
        ]),
      },
      {
        name: "IP 寻址与路由 (Adressage IP et routage)",
        words: words([
          ["IP 数据报", "Datagramme IP", "IP datagram"],
          ["子网掩码", "Masque de sous-réseau", "Subnet mask"],
          ["CIDR 前缀", "Préfixe CIDR", "CIDR prefix"],
          ["地址解析协议", "Protocole de résolution d’adresses (ARP)", "Address Resolution Protocol (ARP)"],
          ["转发表", "Table de transfert", "Forwarding table"],
          ["最长前缀匹配", "Correspondance de préfixe la plus longue", "Longest prefix match"],
          ["链路状态路由", "Routage à état de liens", "Link-state routing"],
          ["距离向量路由", "Routage à vecteur de distance", "Distance-vector routing"],
        ]),
      },
      {
        name: "传输与拥塞控制 (Transport et contrôle de congestion)",
        words: words([
          ["传输控制协议", "Protocole de contrôle de transmission (TCP)", "Transmission Control Protocol (TCP)"],
          ["用户数据报协议", "Protocole de datagramme utilisateur (UDP)", "User Datagram Protocol (UDP)"],
          ["三次握手", "Établissement de connexion en trois temps", "Three-way handshake"],
          ["重传超时", "Délai d’expiration de retransmission", "Retransmission timeout"],
          ["滑动窗口", "Fenêtre glissante", "Sliding window"],
          ["累积确认", "Accusé de réception cumulatif", "Cumulative acknowledgment"],
          ["拥塞窗口", "Fenêtre de congestion", "Congestion window"],
          ["慢启动", "Démarrage lent", "Slow start"],
        ]),
      },
      {
        name: "应用层与性能 (Couche application et performances)",
        words: words([
          ["域名系统", "Système de noms de domaine (DNS)", "Domain Name System (DNS)"],
          ["HTTP 持久连接", "Connexion HTTP persistante", "HTTP persistent connection"],
          ["应用层协议", "Protocole de couche application", "Application-layer protocol"],
          ["套接字", "Socket", "Socket"],
          ["往返时延", "Temps d’aller-retour (RTT)", "Round-trip time (RTT)"],
          ["时延抖动", "Gigue", "Jitter"],
          ["吞吐量", "Débit", "Throughput"],
          ["可靠字节流", "Flux d’octets fiable", "Reliable byte stream"],
        ]),
      },
    ],
  },
];
