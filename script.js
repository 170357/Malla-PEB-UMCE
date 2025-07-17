document.addEventListener('DOMContentLoaded', () => {
    const courseMap = document.getElementById('course-map');
    const mentionSelect = document.getElementById('mention-select');
    const resetButton = document.getElementById('reset-progress');
    let semesterData = {};
    let completedCourses = new Set();
    let selectedMention = 'TODAS'; // Por defecto, mostrar el plan común

    // Función para cargar los datos del JSON
    async function loadCourseData() {
        try {
            const response = await fetch('data_INF.json');
            semesterData = await response.json();
            console.log('Datos de la malla cargados:', semesterData);
            initializeCourseMap();
            loadProgress();
            updateCourseStates();
        } catch (error) {
            console.error('Error cargando los datos de la malla:', error);
        }
    }

    // Cargar progreso guardado en localStorage
    function loadProgress() {
        const savedProgress = localStorage.getItem('completedCourses');
        if (savedProgress) {
            completedCourses = new Set(JSON.parse(savedProgress));
        }
        const savedMention = localStorage.getItem('selectedMention');
        if (savedMention) {
            selectedMention = savedMention;
            mentionSelect.value = savedMention; // Actualizar el select
        }
    }

    // Guardar progreso en localStorage
    function saveProgress() {
        localStorage.setItem('completedCourses', JSON.stringify(Array.from(completedCourses)));
        localStorage.setItem('selectedMention', selectedMention);
    }

    // Inicializar la estructura de la malla en el HTML
    function initializeCourseMap() {
        courseMap.innerHTML = ''; // Limpiar cualquier contenido previo
        const semesterOrder = Object.keys(semesterData).sort((a, b) => parseInt(a.replace('s', '')) - parseInt(b.replace('s', '')));

        semesterOrder.forEach(semesterKey => {
            const semesterNum = parseInt(semesterKey.replace('s', ''));
            const semesterDiv = document.createElement('div');
            semesterDiv.classList.add('semester');
            semesterDiv.innerHTML = `<h2>Semestre ${semesterNum}</h2><div class="courses-grid" id="semester-${semesterNum}"></div>`;
            courseMap.appendChild(semesterDiv);

            const coursesGrid = semesterDiv.querySelector('.courses-grid');

            semesterData[semesterKey].forEach(courseArray => {
                const [name, code, , credits, prerequisites, mention] = courseArray;
                const courseElement = document.createElement('div');
                courseElement.classList.add('course');
                courseElement.dataset.code = code;
                courseElement.dataset.mention = mention;
                courseElement.dataset.semester = semesterNum;

                const reqsDisplay = prerequisites && prerequisites.length > 0 && prerequisites[0] !== "Sin prerrequisitos" ?
                                    `Req: ${prerequisites.join(', ')}` : '';

                courseElement.innerHTML = `
                    <div class="course-name">${name}</div>
                    <div class="course-code">(${code})</div>
                    <div class="course-credits">${credits}</div>
                    ${reqsDisplay ? `<div class="prerequisites">${reqsDisplay}</div>` : ''}
                `;
                coursesGrid.appendChild(courseElement);
            });
        });
    }

    // Función principal para actualizar los estados de los cursos (color y clic)
    function updateCourseStates() {
        document.querySelectorAll('.course').forEach(courseElement => {
            const courseCode = courseElement.dataset.code;
            const courseMention = courseElement.dataset.mention;
            const courseSemester = parseInt(courseElement.dataset.semester);

            // Restablecer clases y opacidad
            courseElement.classList.remove('completed', 'available', 'locked', 'hidden-mention');
            courseElement.style.cursor = '';

            // 1. Manejar visibilidad/estado por mención
            // Si el semestre es <= 6, es un curso común y siempre es relevante.
            // Si el semestre es > 6 y NO es de la mención seleccionada O no es "TODAS", se oculta/desactiva.
            if (courseSemester > 6 && courseMention !== 'TODAS' && courseMention !== selectedMention) {
                courseElement.classList.add('hidden-mention');
                return; // No procesar más el estado de este curso
            }

            // 2. Determinar estado de completado, disponible o bloqueado (para cursos relevantes)
            if (completedCourses.has(courseCode)) {
                courseElement.classList.add('completed');
            } else {
                let allPrereqsMet = true;
                const courseArray = Object.values(semesterData).flat().find(c => c[1] === courseCode);
                const prerequisites = courseArray ? courseArray[4] : [];

                if (prerequisites && prerequisites.length > 0) {
                    for (const prereqCode of prerequisites) {
                        // Manejo especial para "TODOS LOS RAMOS HASTA 8 SEMESTRE"
                        if (prereqCode === "TODOS LOS RAMOS HASTA 8 SEMESTRE") {
                            const totalRelevantCoursesUntilS8 = Object.keys(semesterData)
                                .filter(s => parseInt(s.replace('s', '')) <= 8)
                                .flatMap(s => semesterData[s])
                                .filter(c => c[5] === 'TODAS' || (c[5] !== 'TODAS' && c[5] === selectedMention))
                                .length;

                            const completedRelevantCoursesUntilS8 = Object.keys(semesterData)
                                .filter(s => parseInt(s.replace('s', '')) <= 8)
                                .flatMap(s => semesterData[s])
                                .filter(c => completedCourses.has(c[1]) && (c[5] === 'TODAS' || (c[5] !== 'TODAS' && c[5] === selectedMention)))
                                .length;

                            // Ejemplo: requerir 80% de los cursos relevantes hasta S8 completados
                            const completionPercentage = (totalRelevantCoursesUntilS8 > 0) ? (completedRelevantCoursesUntilS8 / totalRelevantCoursesUntilS8) * 100 : 100;
                            if (completionPercentage < 80) { // Ajusta el porcentaje según necesites
                                allPrereqsMet = false;
                                break;
                            }
                        } else if (!completedCourses.has(prereqCode)) {
                            allPrereqsMet = false;
                            break;
                        }
                    }
                }

                if (allPrereqsMet) {
                    courseElement.classList.add('available');
                } else {
                    courseElement.classList.add('locked');
                }
            }
        });
    }

    // Event listener para clic en los cursos
    courseMap.addEventListener('click', (event) => {
        const courseElement = event.target.closest('.course');
        if (!courseElement) return;

        const courseCode = courseElement.dataset.code;
        const courseName = courseElement.querySelector('.course-name').textContent;

        if (courseElement.classList.contains('available')) {
            if (confirm(`¿Has completado "${courseName}"?`)) {
                completedCourses.add(courseCode);
                saveProgress();
                updateCourseStates();
            }
        } else if (courseElement.classList.contains('completed')) {
            if (confirm(`¿Quieres desmarcar "${courseName}"? Ten en cuenta que esto podría bloquear otros cursos.`)) {
                let canUnmark = true;
                // Verificar si desmarcar este curso rompería prerrequisitos de cursos ya completados
                for (const semKey in semesterData) {
                    for (const courseArray of semesterData[semKey]) {
                        const [, cCode, , , cPrereqs] = courseArray;
                        if (completedCourses.has(cCode) && cCode !== courseCode) {
                            if (cPrereqs && cPrereqs.includes(courseCode)) {
                                canUnmark = false;
                                break;
                            }
                        }
                    }
                    if (!canUnmark) break;
                }

                if (canUnmark) {
                    completedCourses.delete(courseCode);
                    saveProgress();
                    updateCourseStates();
                } else {
                    alert('No puedes desmarcar este curso porque es prerrequisito de otro curso que ya has marcado como completado.');
                }
            }
        }
    });

    // Event listener para el cambio de mención
    mentionSelect.addEventListener('change', (event) => {
        selectedMention = event.target.value;
        saveProgress();
        updateCourseStates();
    });

    // Event listener para el botón de reiniciar progreso
    resetButton.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres reiniciar todo tu progreso? Esta acción no se puede deshacer.')) {
            completedCourses.clear();
            selectedMention = 'TODAS';
            mentionSelect.value = 'TODAS';
            saveProgress();
            updateCourseStates();
        }
    });

    // Cargar datos al iniciar la página
    loadCourseData();
});
