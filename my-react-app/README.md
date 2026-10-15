# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Formatos de constancias por academia

En Configuraciones > Constancias, los cinco formatos predeterminados se mantienen.
Para crear uno adicional, escribe su nombre y pulsa **Agregar formato**. El nuevo
desplegable permite cambiar su nombre y editar titulo, destinatario, cuerpo, nota,
lugar de emision y cierre. Pulsa **Guardar configuracion de constancias** para
persistir los cambios.

Los formatos nuevos incluyen este cierre predeterminado, que sigue siendo editable:
"Esta constancia no será válida ni tendrá efecto legal alguno si carece de la firma
autógrafa y el sello húmedo de la institución/academia." Los cierres ya guardados
se conservan.

Para eliminar un formato personalizado, pulsa el icono de papelera situado dentro
de su cabecera, a la derecha, y confirma. No hace falta abrirlo. Todos los items
conservan el mismo ancho.
La eliminacion se guarda de inmediato junto con los demas
cambios pendientes de constancias y solo afecta al tenant actual. Los cinco
formatos predeterminados no tienen esta opcion. Los formatos eliminados dejan de
estar disponibles para nuevas emisiones y para generar solicitudes anteriores
que los usen; los PDF ya descargados no se modifican.

Cada formato pertenece exclusivamente al tenant actual y aparece en el selector de
emision de constancias de esa academia, incluyendo el flujo de solicitudes de
Esporta. Usa el membrete, logos, tipografia y firmante generales.
Las variables se muestran agrupadas en Alumnos, Entrenadores, Horario y
listado, y Asistencia, siempre visibles en el editor.
Las variables generales de formatos anteriores siguen funcionando, pero no se
muestran en la ayuda visual.

Los administradores pueden seleccionar un entrenador al emitir una constancia.
Las variables `entrenador_nombre`, `entrenador_apellido`,
`entrenador_nombre_completo`, `entrenador_cedula`, `entrenador_telefono`,
`entrenador_correo`, `entrenador_direccion`, `entrenador_especialidad`,
`entrenador_fecha_nacimiento` y `entrenador_fecha_ingreso` se completan con los datos
de ese entrenador, exclusivamente del tenant actual. No se exponen datos de nomina.

Un formato personalizado puede emitirse para un alumno, un entrenador o ambos.
Si el texto usa variables de alumno o entrenador, se exige la seleccion
correspondiente. Las variables de horario o asistencia habilitan sus campos al
emitir un formato personalizado. `cantidad_alumnos` indica el total del listado,
uno en una constancia individual de alumno, o cero si solo hay entrenador.
Las variables se sustituyen en titulo, destinatario, cuerpo, nota, lugar de emision
y cierre. Los formatos predeterminados siguen requiriendo alumnos y los usuarios
no administrativos no pueden consultar ni emitir datos de entrenadores.
Las restricciones actuales de acceso y solvencia siguen aplicandose a alumnos.
No es necesario migrar los datos existentes.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The start script keeps Webpack's development cache in the operating system's
temporary directory, isolated by project and Node version. This avoids loading
stale or conflicted cache packs from synced folders such as OneDrive. No manual
cache cleanup or extra command-line flags are needed.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
